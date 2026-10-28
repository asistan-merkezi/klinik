// /api/canli: her ping'de oturum yeniden doğrulanır; iptal / başka kullanıcı / başka klinik / geçici şifre durumunda bağlantı kapanır (gerçek route + gerçek dağıtıcı).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ortamKur } from "./yardimci";
import { oturum, oturumAc, oturumKapat } from "./oturum-durumu";
import { canliTekil } from "@/lib/realtime";

vi.mock("@/lib/auth/oturum", async (orijinal) => ({
  ...(await orijinal<typeof import("@/lib/auth/oturum")>()),
  getSessionContext: async () => oturum.ctx,
}));
import { GET } from "@/app/api/canli/route";

let K1: Record<string, string>;
let K2: Record<string, string>;
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(() => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
});
afterEach(() => oturumKapat());

/** Akıştan gelen metni biriktirir; akış bitince `bitti` true olur. */
function dinle(r: Response) {
  const durum = { metin: "", bitti: false };
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        durum.bitti = true;
        return;
      }
      durum.metin += dec.decode(value);
    }
  })();
  return durum;
}
async function bitisiBekle(d: { bitti: boolean }, ms = 2000) {
  const t0 = Date.now();
  while (!d.bitti && Date.now() - t0 < ms) await bekle(20);
}
const baglan = () => GET(new Request("http://x/api/canli?t=randevu"));

describe("SSE oturum denetimi", () => {
  it("oturum geçerliyken ping'ler akışı KAPATMAZ", async () => {
    oturumAc({ userId: K1.kullanici, klinikId: K1.klinik, rol: "klinik_admin" });
    const yanit = await baglan();
    expect(yanit.status).toBe(200);
    const d = dinle(yanit);
    canliTekil().dagitici.ping();
    await bekle(150);
    canliTekil().dagitici.ping();
    await bekle(150);
    expect(d.bitti).toBe(false);
    expect(d.metin).toContain("event: ping");
    expect(d.metin).not.toContain("event: oturum");
    oturumKapat();
    canliTekil().dagitici.ping(); // temizlik: bu bağlantıyı kapat
    await bitisiBekle(d);
  });

  it("oturum iptal edilince (oturum çözümlenemez) sonraki ping'de akış 'oturum' olayıyla kapanır", async () => {
    oturumAc({ userId: K1.kullanici, klinikId: K1.klinik, rol: "klinik_admin" });
    const d = dinle(await baglan());
    await bekle(100);
    oturumKapat(); // sunucuda oturum silindi / süresi doldu / gece kapanışı
    canliTekil().dagitici.ping();
    await bitisiBekle(d);
    expect(d.bitti).toBe(true);
    expect(d.metin).toContain('event: oturum');
  });

  it("kullanıcı veya klinik bağlamı değişirse (ör. destek bağlamı bitti, hesap yeniden atandı) ve geçici şifre zorunluluğu gelirse akış kapanır", async () => {
    for (const degis of [
      () => oturumAc({ userId: randomUUID(), klinikId: K1.klinik, rol: "klinik_admin" }),
      () => oturumAc({ userId: K1.kullanici, klinikId: K2.klinik, rol: "klinik_admin" }),
      () => {
        oturum.ctx!.sifreDegistirmeli = true;
      },
    ]) {
      oturumAc({ userId: K1.kullanici, klinikId: K1.klinik, rol: "klinik_admin" });
      const d = dinle(await baglan());
      await bekle(100);
      degis();
      canliTekil().dagitici.ping();
      await bitisiBekle(d);
      expect(d.bitti).toBe(true);
      expect(d.metin).toContain("event: oturum");
    }
  });

  it("oturumsuz 401, hasta 403 (akış hiç açılmaz)", async () => {
    oturumKapat();
    expect((await baglan()).status).toBe(401);
    oturumAc({ userId: randomUUID(), klinikId: K1.klinik, rol: "hasta", hastaId: randomUUID() });
    expect((await baglan()).status).toBe(403);
  });
});

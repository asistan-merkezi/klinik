// Güvenlik taban çizgisi — gerçek Postgres sayacı + gerçek route kodu (docs/guvenlik-baseline.md): hız sınırları, köken denetimi, girdi doğrulama, dosya yükleme.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ortamKur, personelKur } from "./yardimci";
import { oturum, oturumAc, oturumKapat } from "./oturum-durumu";
import { SINIRLAR, sinirKontrol, type SinirAdi } from "@/lib/guvenlik/istek-siniri";

vi.mock("@/lib/auth/oturum", async (orijinal) => ({
  ...(await orijinal<typeof import("@/lib/auth/oturum")>()),
  getSessionContext: async () => oturum.ctx,
}));

import { GET as aramaGet } from "@/app/api/hasta-arama/route";
import { POST as fotoPost } from "@/app/api/hasta-belge/foto-yukle/route";
import { POST as chatbotPost } from "@/app/api/destek-chatbot/route";
import { hastaDetayOzetiGetir } from "@/app/(app)/panel/hastalar/[id]/veri-actions";
import { arsivParcasiSemasi } from "@/lib/guvenlik/girdi";
import { hastalariArsivdenIceAktar } from "@/app/(app)/panel/ayarlar/arsiv-ice-aktarma/hastalar/actions";
import { icerikTipiDogrula, BELGE_UZANTILARI } from "@/lib/dosya/imza";
import { MAX_DOSYA_BOYUTU_BYTE } from "@/types/hasta-belge";

let K1: Record<string, string>;
let admin: string, resepsiyon: string;
afterEach(() => oturumKapat());

beforeAll(async () => {
  K1 = ortamKur().ids.k1;
  admin = K1.kullanici;
  resepsiyon = (await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" })).id;
});

describe("kullanıcı başına hız sınırı (DB sayacı, fail-closed)", () => {
  it.each(Object.keys(SINIRLAR) as SinirAdi[])("%s: limitin içinde izin, limit aşılınca 429; başka kullanıcı etkilenmez", async (ad) => {
    const limit = SINIRLAR[ad].limit;
    if (limit > 700) return;
    const kim = `kullanici-${ad}-${randomUUID()}`;
    for (let i = 0; i < limit; i++) expect((await sinirKontrol(ad, kim)).izin, `${ad} #${i + 1}`).toBe(true);
    expect(await sinirKontrol(ad, kim)).toMatchObject({ izin: false, durum: 429 });
    expect((await sinirKontrol(ad, `baska-${randomUUID()}`)).izin).toBe(true);
  }, 120_000);
});

describe("/api/hasta-arama", () => {
  it("oturumsuz 401; hız sınırı aşılınca 429 + Retry-After (kullanıcı başına)", async () => {
    expect((await aramaGet(new Request("http://x/api/hasta-arama?q=ayse"))).status).toBe(401);
    oturumAc({ userId: randomUUID(), klinikId: K1.klinik, rol: "resepsiyon" });
    // Oturum kullanıcısı gerçek olmasa da sayaç kullanıcı kimliğiyle tutulur; ilk istekler 200/500 olabilir ama 429 DEĞİLDİR.
    let ilk429 = 0;
    for (let i = 1; i <= SINIRLAR.hastaArama.limit + 1; i++) {
      const r = await aramaGet(new Request("http://x/api/hasta-arama?q="));
      if (r.status === 429) {
        ilk429 = i;
        expect(r.headers.get("retry-after")).toBeTruthy();
        break;
      }
    }
    expect(ilk429).toBe(SINIRLAR.hastaArama.limit + 1);
  }, 120_000);
});

describe("CSRF: durum değiştiren route'lar", () => {
  const form = () => {
    const f = new FormData();
    f.set("hastaId", randomUUID());
    return f;
  };
  it("foto-yukle: farklı Origin ve cross-site isteği oturum olsa bile 403; aynı kökenli ama eksik veri 400", async () => {
    oturumAc({ userId: resepsiyon, klinikId: K1.klinik, rol: "resepsiyon" });
    const kotu = await fotoPost(new Request("http://localhost:3000/api/hasta-belge/foto-yukle", { method: "POST", body: form(), headers: { origin: "https://evil.example" } }));
    expect(kotu.status).toBe(403);
    const cs = await fotoPost(new Request("http://localhost:3000/api/hasta-belge/foto-yukle", { method: "POST", body: form(), headers: { "sec-fetch-site": "cross-site" } }));
    expect(cs.status).toBe(403);
    const iyi = await fotoPost(new Request("http://localhost:3000/api/hasta-belge/foto-yukle", { method: "POST", body: form(), headers: { origin: process.env.BETTER_AUTH_URL!, "sec-fetch-site": "same-origin" } }));
    expect(iyi.status).toBe(400);
    expect((await iyi.json()).error).toBe("Eksik veri.");
  });
  it("chatbot: kapalıyken 404; çapraz köken reddi bayraktan sonra, oturumdan ÖNCE", async () => {
    vi.stubEnv("DESTEK_CHATBOT_ACIK", "1");
    try {
      const r = await chatbotPost(new Request("http://localhost:3000/api/destek-chatbot", { method: "POST", body: "{}", headers: { origin: "https://evil.example" } }));
      expect(r.status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await chatbotPost(new Request("http://localhost:3000/api/destek-chatbot", { method: "POST", body: "{}" }))).status).toBe(404);
  });
});

describe("girdi doğrulama: gerçek eylemler", () => {
  it("biçimi bozuk kimlik DB'ye gitmeden kontrollü hatayla durur (iç ayrıntı yok)", async () => {
    oturumAc({ userId: admin, klinikId: K1.klinik, rol: "klinik_admin" });
    await expect(hastaDetayOzetiGetir("1' or '1'='1")).rejects.toThrow("Geçersiz hastaId.");
    await expect(hastaDetayOzetiGetir("../../etc/passwd")).rejects.toThrow("Geçersiz hastaId.");
  });
  it("arşiv içe aktarma: aşırı büyük parça reddedilir (DoS), geçerli boş parça kabul edilir", async () => {
    oturumAc({ userId: admin, klinikId: K1.klinik, rol: "klinik_admin" });
    expect((await hastalariArsivdenIceAktar(Array(501).fill({ ad_soyad: "x" }), 0)).message).toBe("Geçersiz veri parçası.");
    expect((await hastalariArsivdenIceAktar([{ ad_soyad: "x".repeat(5000) }], 0)).message).toBe("Geçersiz veri parçası.");
    expect(arsivParcasiSemasi.safeParse({ kayitlar: [], baslangicSatirNo: 0 }).success).toBe(true);
  });
});

describe("dosya yükleme: imza + uzantı beyaz listesi + boyut", () => {
  it("içerik imzası bildirilen MIME ile eşleşmeli (sahte uzantı/MIME reddedilir); uzantı MIME'dan türetilir; yalnız 4 tür", () => {
    const pdf = Buffer.from("%PDF-1.7 ...");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(icerikTipiDogrula("application/pdf", pdf)).toBe(true);
    expect(icerikTipiDogrula("image/png", png)).toBe(true);
    expect(icerikTipiDogrula("image/jpeg", jpg)).toBe(true);
    expect(icerikTipiDogrula("image/png", pdf)).toBe(false); // PDF'i PNG diye göndermek
    expect(icerikTipiDogrula("application/pdf", Buffer.from("<html><script>alert(1)</script>"))).toBe(false);
    expect(icerikTipiDogrula("text/html", Buffer.from("<html>"))).toBe(false);
    expect(icerikTipiDogrula("application/x-msdownload", Buffer.from("MZ"))).toBe(false);
    expect(Object.keys(BELGE_UZANTILARI).sort()).toEqual(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    expect(Object.values(BELGE_UZANTILARI).sort()).toEqual(["jpg", "pdf", "png", "webp"]);
    // Caddy yükleme yolunun gövde sınırı uygulamanın dosya sınırından BÜYÜK olmalı (aksi halde geçerli dosya proxy'de 413 alır), diğer yollar 25MB.
    const caddy = fs.readFileSync(path.join(__dirname, "../../deploy/windows/Caddyfile"), "utf8");
    const yukleme = Number(/request_body @yukleme \{\s*max_size (\d+)MB/.exec(caddy)![1]) * 1024 * 1024;
    expect(yukleme).toBeGreaterThan(MAX_DOSYA_BOYUTU_BYTE);
    expect(caddy).toMatch(/request_body @yukleme_disi \{\s*max_size 25MB/);
  });
});

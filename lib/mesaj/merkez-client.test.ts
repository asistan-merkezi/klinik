import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { merkezdenKrediPaketleriCek, merkezdenOdemeOturumuOlustur, merkezeGonder } from "./merkez-client";

// Çekirdek fitness'taki merkez-client.test.ts ile ayrıntılı test ediliyor; burada klinik imzaları.
const ANAHTAR = "amk_klinik";
type Cagri = { url: string; headers: Record<string, string>; body: string };

function sahteFetch(yanitlar: Array<{ status: number; govde: unknown }>) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    cagrilar.push({ url, headers: init.headers as Record<string, string>, body: String(init.body ?? "") });
    const y = yanitlar.shift();
    if (!y) throw new Error("beklenmeyen istek: " + url);
    return new Response(JSON.stringify(y.govde), { status: y.status });
  }));
  return cagrilar;
}

beforeEach(() => {
  vi.stubEnv("MESAJ_MERKEZ_BASE_URL", "https://merkez.test");
  vi.stubEnv("MESAJ_MERKEZ_API_KEY", ANAHTAR);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("klinik merkez istemcisi", () => {
  it("klinikId → disKullaniciId, imzalı /api/v1/mesaj/gonder, ticari tetikleyici", async () => {
    const c = sahteFetch([{ status: 200, govde: { mesajIstekId: "m1", durum: "queued", kalanBakiye: 3, bakiyeVersiyonu: 8 } }]);
    const s = await merkezeGonder({ klinikId: "k-1", kanal: "sms", aliciAdres: "905320000001", metin: "Doğum gününüz kutlu olsun", idempotencyKey: "klinik:q1", testMi: false, tetikleyiciKodu: "hasta_dogum_gunu" });
    expect(s).toEqual({ ulasildi: true, basarili: true, saglayiciMesajId: "m1", kalanBakiye: 3, bakiyeVersiyonu: 8 });
    expect(c[0].url).toBe("https://merkez.test/api/v1/mesaj/gonder");
    expect(JSON.parse(c[0].body)).toMatchObject({ disKullaniciId: "k-1", mesajTipi: "ticari", kaynakBolum: "hasta_dogum_gunu" });
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(c[0].headers["X-Imza"])!;
    expect(v1).toBe(createHmac("sha256", ANAHTAR).update(`${t}.${c[0].body}`).digest("hex"));
  });

  it("paket fiyatı kuruştan TL'ye", async () => {
    sahteFetch([{ status: 200, govde: { paketler: [{ paketId: "p1", adet: 500, fiyatKurus: 32550, paraBirimi: "TRY" }] } }]);
    expect(await merkezdenKrediPaketleriCek("sms")).toEqual({ ulasildi: true, paketler: [{ id: "p1", adet: 500, fiyat: 325.5, paraBirimi: "TRY" }] });
  });

  it("ödeme oturumu ucu yoksa ulaşılamadı döner (ödeme sağlayıcısı henüz bağlı değil)", async () => {
    sahteFetch([{ status: 404, govde: {} }, { status: 200, govde: {} }, { status: 404, govde: {} }]);
    const s = await merkezdenOdemeOturumuOlustur({ klinikId: "k-1", kanal: "sms", paketId: "p1", donusUrl: "https://klinik.test/d" });
    expect(s.ulasildi).toBe(false);
  });
});

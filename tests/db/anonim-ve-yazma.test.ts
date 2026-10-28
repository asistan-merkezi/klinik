// Anonim self-servis uçlar (olumlu/olumsuz yol, hız sınırı fail-closed, başka kliniğe yazma kapalı) ve yetkisiz tablolara yazan RPC/tetikleyiciler.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { basliklar, duzenekOlustur, ortamKur, reddedilmeli, superBaglan, tenantdaCalistir } from "./yardimci";
import { anonimKayitTesti } from "../../db/kontrol/anonim-kayit-testi.mjs";
import { yazmaTestleri, yazanlariBul, yetkisizTablolar } from "../../db/kontrol/yetkisiz-tablo-yazanlar.mjs";

let K1: Record<string, string>;
let K2: Record<string, string>;
let ip = 20;
const yeniIp = () => `192.0.2.${++ip}`;

beforeAll(() => {
  const { ids } = ortamKur();
  K1 = ids.k1;
  K2 = ids.k2;
});

describe("db/kontrol/anonim-kayit-testi (SQL düzeyi)", () => {
  it("tüm olumlu/olumsuz yollar geçer", async () => {
    const sonuc = await anonimKayitTesti(duzenekOlustur());
    const basarisiz = sonuc.filter((s: { durum: string }) => s.durum === "BAŞARISIZ");
    expect(basarisiz).toEqual([]);
    expect(sonuc.filter((s: { durum: string }) => s.durum === "GEÇTİ").length).toBeGreaterThanOrEqual(15);
  });
});

describe("anonimUcCalistir (uygulama katmanı kapısı)", () => {
  const kayit = (klinikId: string, tel: string, ek: Record<string, unknown> = {}) => async (tx: import("@/lib/db").Tx) => {
    const { sema } = await import("@/lib/db");
    await tx.insert(sema.hasta).values({ id: randomUUID(), klinikId, adSoyad: "QR Hasta", telefon: tel, kayitKanali: "qr_self_servis", kvkkOnayTarihi: new Date().toISOString(), kvkkOnaylayanTip: "hasta", ...ek });
    return "eklendi";
  };

  it("geçerli kayıt başarılı; kısa koddan çözülen klinik dışına yazma DB'de reddedilir", async () => {
    const { anonimUcCalistir } = await import("@/lib/guvenlik/anonim-uc");
    const ok = await anonimUcCalistir({ ucAdi: "qr_kayit", kisaKod: "klinikbir", basliklar: basliklar(yeniIp()), qrTipi: "hasta_on_kayit" }, (tx, k) => kayit(k.id, "5559001001")(tx));
    expect(ok).toEqual({ ok: true, sonuc: "eklendi" });
    // Saldırgan başka kliniğin UUID'sini satıra yazar: DB bağlam/klinik_id eşleşmesini zorlar
    await expect(
      anonimUcCalistir({ ucAdi: "qr_kayit", kisaKod: "klinikbir", basliklar: basliklar(yeniIp()), qrTipi: "hasta_on_kayit" }, (tx) => kayit(K2.klinik, "5559001002")(tx))
    ).rejects.toThrow();
    const sup = await superBaglan();
    try {
      // süper kullanıcı RLS'i atlar: kayıtlar buradan doğrudan görülür
      const r = await sup.query("select telefon, klinik_id from hasta where telefon in ('5559001001','5559001002') order by telefon");
      expect(r.rows).toEqual([{ telefon: "5559001001", klinik_id: K1.klinik }]); // K2'ye yazma denemesi HİÇ satır oluşturmadı
    } finally {
      await sup.end();
    }
    const k1 = await tenantdaCalistir(K1.klinik, (c) => c.query("select count(*)::int n from hasta where telefon = '5559001001'"));
    const k2 = await tenantdaCalistir(K2.klinik, (c) => c.query("select count(*)::int n from hasta where klinik_id = $1 and telefon in ('5559001001','5559001002')", [K2.klinik]));
    expect(k1.rows[0].n).toBe(1);
    expect(k2.rows[0].n).toBe(0);
  });

  it("bilinmeyen kısa kod reddedilir; kapalı QR hem uygulama hem DB katmanında reddedilir", async () => {
    const { anonimUcCalistir } = await import("@/lib/guvenlik/anonim-uc");
    expect(await anonimUcCalistir({ ucAdi: "qr_kayit", kisaKod: "yok-kod", basliklar: basliklar(yeniIp()) }, async () => 1)).toMatchObject({ ok: false, kod: "klinik_yok" });
    expect(await anonimUcCalistir({ ucAdi: "qr_kayit", kisaKod: "!!gecersiz!!", basliklar: basliklar(yeniIp()) }, async () => 1)).toMatchObject({ ok: false, kod: "klinik_yok" });

    await tenantdaCalistir(K2.klinik, (c) => c.query(`insert into klinik_ayarlar(klinik_id, ayarlar) values ($1, '{"qr_kodlari":{"hasta_on_kayit":{"aktif":false}}}'::jsonb) on conflict (klinik_id) do update set ayarlar = excluded.ayarlar`, [K2.klinik]));
    const kapali = await anonimUcCalistir({ ucAdi: "qr_kayit", kisaKod: "klinikiki", basliklar: basliklar(yeniIp()), qrTipi: "hasta_on_kayit" }, (tx, k) => kayit(k.id, "5559001003")(tx));
    expect(kapali).toMatchObject({ ok: false, kod: "kapali" });
    // uygulama kontrolü atlansa bile (qrTipi verilmeden) DB politikası kapalı QR'a kayıt eklemeyi reddeder
    await expect(anonimUcCalistir({ ucAdi: "qr_kayit", kisaKod: "klinikiki", basliklar: basliklar(yeniIp()) }, (tx, k) => kayit(k.id, "5559001004")(tx))).rejects.toThrow();
  });

  it("hız sınırı: IP başına limit aşılınca reddedilir; sayaç erişilemezse FAIL-CLOSED", async () => {
    const { anonimUcCalistir } = await import("@/lib/guvenlik/anonim-uc");
    const sabitIp = yeniIp();
    const sonuclar = [];
    for (let i = 0; i < 4; i++) sonuclar.push(await anonimUcCalistir({ ucAdi: "hiz_testi", kisaKod: "klinikbir", basliklar: basliklar(sabitIp), ipLimiti: 3 }, async () => i));
    expect(sonuclar.slice(0, 3).every((s) => s.ok)).toBe(true);
    expect(sonuclar[3]).toMatchObject({ ok: false, kod: "hiz" });

    const sup = await superBaglan();
    try {
      await sup.query("REVOKE EXECUTE ON FUNCTION hiz_siniri_kullan(text, integer, integer, boolean) FROM klinik_uygulama, klinik_anonim");
      const kapali = await anonimUcCalistir({ ucAdi: "hiz_testi2", kisaKod: "klinikbir", basliklar: basliklar(yeniIp()) }, async () => "yazildi");
      expect(kapali).toMatchObject({ ok: false, kod: "kullanilamiyor" });
    } finally {
      await sup.query("GRANT EXECUTE ON FUNCTION hiz_siniri_kullan(text, integer, integer, boolean) TO klinik_uygulama, klinik_anonim");
      await sup.end();
    }
  });
});

describe("kodda doğrudan yetkisi olmayan tablolar: yazan tetikleyici/RPC'ler gerçekten yazabilir", () => {
  it("yetkisiz tablolar listesi beklenen kümedir", async () => {
    const sup = await superBaglan();
    try {
      const t = await yetkisizTablolar(sup);
      // odeme ve odeme_kalemi, politika bağımlılığı nedeniyle (islem_tanimi_select_portal) yalnız SELECT yetkisi aldı; yazma yolları yine RPC/tetikleyicidir.
      expect(t).toEqual(expect.arrayContaining(["islem_tanimi_fiyat_gecmisi", "pozisyon_sablonlari", "hiz_siniri_sayac"]));
      expect(t).not.toContain("odeme");
      // odeme_satiri artık Cari sayfasında okunduğu için SELECT yetkisi aldı (yazma yine RPC'den).
      expect(t).not.toContain("odeme_satiri");
      // destek_baglami (0015): yalnız DEFINER destek_baglami_* fonksiyonları yazar
      expect(t).toContain("destek_baglami");
      expect(t.length).toBe(15);
    } finally {
      await sup.end();
    }
  });

  it("her yazma yolu 'permission denied' OLMADAN satır üretir", async () => {
    const sonuc = await yazmaTestleri(duzenekOlustur());
    const basarisiz = sonuc.filter((s: { durum: string }) => s.durum === "BAŞARISIZ");
    expect(basarisiz, JSON.stringify(basarisiz, null, 1)).toEqual([]);
  });

  it("yazanlar bulunur (gövde taraması)", async () => {
    const sup = await superBaglan();
    try {
      const yaz = (await yazanlariBul(sup, ["odeme", "hiz_siniri_sayac", "islem_tanimi_fiyat_gecmisi"])) as Record<string, { yazanlar: { imza: string }[] }>;
      expect(yaz.odeme.yazanlar.length).toBeGreaterThan(0);
      expect(yaz.hiz_siniri_sayac.yazanlar.map((x) => x.imza).join()).toContain("hiz_siniri_kullan");
    } finally {
      await sup.end();
    }
  });
});

void reddedilmeli;

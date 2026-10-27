// Modül 1 (klinik ayarları: klinik, klinik_ayarlar, klinik_muhasebe_entegrasyonu, klinik_arac, klinik_banka_hesaplari, klinik_kredi_kartlari)
// Eylemlerin kullandığı Drizzle ifadelerinin AYNILARI gerçek veritabanında: tenant izolasyonu, rol yetkisi, gerçek yazma yolu.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ortamKur, personelKur, reddedilmeli, tenantBaglami } from "./yardimci";

let K1: Record<string, string>;
let K2: Record<string, string>;
let admin1: string, admin2: string, resepsiyon1: string, terapist1: string;

beforeAll(async () => {
  const { ids } = ortamKur();
  K1 = ids.k1;
  K2 = ids.k2;
  admin1 = (await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;
  resepsiyon1 = (await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" })).id;
  terapist1 = (await personelKur({ klinikId: K1.klinik, rol: "terapist" })).id;
});

const bag = (klinik: string, kullanici: string) => tenantBaglami({ klinik, kullanici });

describe("modül 1: gerçek yazma yolu (klinik_admin) — 'permission denied' yok", () => {
  it("şirket bilgileri güncellenir (klinik satırı)", async () => {
    const { withTenant, sema } = await import("@/lib/db");
    await withTenant(bag(K1.klinik, admin1), (tx) =>
      tx.update(sema.klinik).set({ unvan: "Test Ünvan", vergiNo: "1234567890", haftaIciBaslangic: "08:00", haftaIciBitis: "19:00", logoUrl: "/api/dosya/logo?v=1" }).where(eq(sema.klinik.id, K1.klinik))
    );
    const satir = await withTenant(bag(K1.klinik, admin1), (tx) => tx.select({ unvan: sema.klinik.unvan, logo: sema.klinik.logoUrl, bas: sema.klinik.haftaIciBaslangic }).from(sema.klinik).where(eq(sema.klinik.id, K1.klinik)));
    expect(satir[0]).toMatchObject({ unvan: "Test Ünvan", logo: "/api/dosya/logo?v=1" });
    expect(satir[0].bas).toMatch(/^08:00/);
  });

  it("araç ekle/sil, banka hesabı ekle/güncelle/sil, kredi kartı ekle/güncelle/sil", async () => {
    const { withTenant, sema } = await import("@/lib/db");
    const b = bag(K1.klinik, admin1);
    await withTenant(b, (tx) => tx.insert(sema.klinikArac).values({ klinikId: K1.klinik, marka: "Fiat", model: "Doblo", plaka: "34 ABC 123", olusturanKullaniciId: admin1 }));
    const arac = await withTenant(b, (tx) => tx.select({ id: sema.klinikArac.id }).from(sema.klinikArac).where(eq(sema.klinikArac.plaka, "34 ABC 123")));
    expect(arac).toHaveLength(1);
    await withTenant(b, (tx) => tx.delete(sema.klinikArac).where(and(eq(sema.klinikArac.id, arac[0].id), eq(sema.klinikArac.klinikId, K1.klinik))));

    await withTenant(b, (tx) => tx.insert(sema.klinikBankaHesaplari).values({ klinikId: K1.klinik, hesapTipi: "klinik", bankaAdi: "Test Bank", hesapSahibi: "", iban: "TR000000000000000000000000", sortOrder: 0 }));
    const hesap = await withTenant(b, (tx) => tx.select({ id: sema.klinikBankaHesaplari.id }).from(sema.klinikBankaHesaplari).where(eq(sema.klinikBankaHesaplari.bankaAdi, "Test Bank")));
    await withTenant(b, (tx) => tx.update(sema.klinikBankaHesaplari).set({ bankaAdi: "Test Bank 2" }).where(eq(sema.klinikBankaHesaplari.id, hesap[0].id)));
    // tahsilat ayarı (klinik.kredi_karti_*)
    await withTenant(b, (tx) => tx.update(sema.klinik).set({ krediKartiTahsilatBankaHesapId: hesap[0].id, krediKartiKomisyonOrani: "2.5" }).where(eq(sema.klinik.id, K1.klinik)));
    await withTenant(b, (tx) => tx.update(sema.klinik).set({ krediKartiTahsilatBankaHesapId: null }).where(eq(sema.klinik.id, K1.klinik)));
    await withTenant(b, (tx) => tx.delete(sema.klinikBankaHesaplari).where(eq(sema.klinikBankaHesaplari.id, hesap[0].id)));

    await withTenant(b, (tx) => tx.insert(sema.klinikKrediKartlari).values({ klinikId: K1.klinik, kartTipi: "klinik", kartAdi: "Kart", bankaAdi: "Bank", kartSahibi: "X", sonDortHane: "1234", sortOrder: 0 }));
    const kart = await withTenant(b, (tx) => tx.select({ id: sema.klinikKrediKartlari.id }).from(sema.klinikKrediKartlari).where(eq(sema.klinikKrediKartlari.kartAdi, "Kart")));
    await withTenant(b, (tx) => tx.update(sema.klinikKrediKartlari).set({ kartAdi: "Kart 2" }).where(eq(sema.klinikKrediKartlari.id, kart[0].id)));
    await withTenant(b, (tx) => tx.delete(sema.klinikKrediKartlari).where(eq(sema.klinikKrediKartlari.id, kart[0].id)));
  });

  it("sidebar ayarları: klinik_ayarlar upsert (FOR UPDATE ile read-modify-write)", async () => {
    const { withTenant, sema } = await import("@/lib/db");
    const b = bag(K1.klinik, admin1);
    await withTenant(b, async (tx) => {
      const m = await tx.select({ a: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, K1.klinik)).for("update").limit(1);
      const ayar = { ...((m[0]?.a as Record<string, unknown>) ?? {}), sidebar_gizli: { Test: ["finans"] } };
      await tx.insert(sema.klinikAyarlar).values({ klinikId: K1.klinik, ayarlar: ayar }).onConflictDoUpdate({ target: sema.klinikAyarlar.klinikId, set: { ayarlar: ayar } });
    });
    const oku = await withTenant(b, (tx) => tx.select({ a: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, K1.klinik)));
    expect((oku[0].a as { sidebar_gizli: Record<string, string[]> }).sidebar_gizli.Test).toEqual(["finans"]);
  });

  it("muhasebe sync: secret SELECT'e kapalı (permission denied), parasut_secret_var okunur, upsert çalışır", async () => {
    const { withTenant, sema } = await import("@/lib/db");
    const b = bag(K1.klinik, admin1);
    const degerler = { parasutClientId: "cid", parasutClientSecret: "cok-gizli", parasutCompanyId: "co", baglantiDurumu: "baglandi" };
    await withTenant(b, (tx) => tx.insert(sema.klinikMuhasebeEntegrasyonu).values({ klinikId: K1.klinik, ...degerler }).onConflictDoUpdate({ target: sema.klinikMuhasebeEntegrasyonu.klinikId, set: degerler }));
    const var_ = await withTenant(b, (tx) => tx.select({ v: sema.klinikMuhasebeEntegrasyonu.parasutSecretVar, id: sema.klinikMuhasebeEntegrasyonu.parasutClientId }).from(sema.klinikMuhasebeEntegrasyonu).where(eq(sema.klinikMuhasebeEntegrasyonu.klinikId, K1.klinik)));
    expect(var_[0]).toEqual({ v: true, id: "cid" });
    // secret kolonunu seçmek reddedilir (kolon düzeyinde yetki yok)
    await reddedilmeli(withTenant(b, (tx) => tx.select({ s: sema.klinikMuhasebeEntegrasyonu.parasutClientSecret }).from(sema.klinikMuhasebeEntegrasyonu)), /permission denied/i);
    await reddedilmeli(withTenant(b, (tx) => tx.select().from(sema.klinikMuhasebeEntegrasyonu)), /permission denied/i);
    // secret'siz güncelleme mevcut secret'ı korur
    await withTenant(b, (tx) => tx.update(sema.klinikMuhasebeEntegrasyonu).set({ parasutCompanyId: "co2" }).where(eq(sema.klinikMuhasebeEntegrasyonu.klinikId, K1.klinik)));
    const hala = await withTenant(b, (tx) => tx.select({ v: sema.klinikMuhasebeEntegrasyonu.parasutSecretVar }).from(sema.klinikMuhasebeEntegrasyonu));
    expect(hala[0].v).toBe(true);
  });
});

describe("modül 1: başka tenant okuyamaz / yazamaz / silemez", () => {
  it("B yöneticisi A'nın klinik, araç, banka hesabı, kredi kartı, ayar ve entegrasyon satırlarını göremez/değiştiremez/silemez", async () => {
    const { withTenant, sema } = await import("@/lib/db");
    const a = bag(K1.klinik, admin1);
    const b = bag(K2.klinik, admin2);
    await withTenant(a, (tx) => tx.insert(sema.klinikArac).values({ klinikId: K1.klinik, marka: "A", model: "A", plaka: "A-1" }));
    await withTenant(a, (tx) => tx.insert(sema.klinikBankaHesaplari).values({ klinikId: K1.klinik, hesapTipi: "klinik", bankaAdi: "A Bank", hesapSahibi: "", iban: "", sortOrder: 0 }));
    await withTenant(a, (tx) => tx.insert(sema.klinikKrediKartlari).values({ klinikId: K1.klinik, kartTipi: "klinik", kartAdi: "A Kart", bankaAdi: "A", kartSahibi: "", sortOrder: 0 }));

    const tablolar = [
      ["klinik_arac", sema.klinikArac, sema.klinikArac.klinikId],
      ["klinik_banka_hesaplari", sema.klinikBankaHesaplari, sema.klinikBankaHesaplari.klinikId],
      ["klinik_kredi_kartlari", sema.klinikKrediKartlari, sema.klinikKrediKartlari.klinikId],
    ] as const;
    for (const [ad, tablo, klinikKolonu] of tablolar) {
      expect(await withTenant(b, (tx) => tx.select().from(tablo).where(eq(klinikKolonu, K1.klinik))), `${ad} okuma`).toHaveLength(0);
      expect(await withTenant(b, (tx) => tx.delete(tablo).where(eq(klinikKolonu, K1.klinik)).returning()), `${ad} silme`).toHaveLength(0);
    }
    // yazma: B bağlamıyla A kliniğine ekleme RLS tarafından reddedilir
    await reddedilmeli(withTenant(b, (tx) => tx.insert(sema.klinikArac).values({ klinikId: K1.klinik, marka: "X", model: "X", plaka: "X" })), /row-level security/i);
    await reddedilmeli(withTenant(b, (tx) => tx.insert(sema.klinikBankaHesaplari).values({ klinikId: K1.klinik, hesapTipi: "klinik", bankaAdi: "X", hesapSahibi: "", iban: "", sortOrder: 9 })), /row-level security/i);
    // güncelleme: etkilenen satır yok
    expect(await withTenant(b, (tx) => tx.update(sema.klinik).set({ unvan: "ele geçirildi" }).where(eq(sema.klinik.id, K1.klinik)).returning({ id: sema.klinik.id }))).toHaveLength(0);
    expect(await withTenant(b, (tx) => tx.update(sema.klinikAyarlar).set({ ayarlar: {} }).where(eq(sema.klinikAyarlar.klinikId, K1.klinik)).returning())).toHaveLength(0);
    expect(await withTenant(b, (tx) => tx.select({ id: sema.klinikMuhasebeEntegrasyonu.klinikId }).from(sema.klinikMuhasebeEntegrasyonu).where(eq(sema.klinikMuhasebeEntegrasyonu.klinikId, K1.klinik)))).toHaveLength(0);
    // klinik satırı: B yalnız kendisini görür
    const gorunen = await withTenant(b, (tx) => tx.select({ id: sema.klinik.id }).from(sema.klinik));
    expect(gorunen.map((k) => k.id)).toEqual([K2.klinik]);
  });
});

describe("modül 1: rol bazlı yetki (RLS) — yetkisiz rol reddedilir", () => {
  it("resepsiyon ve terapist banka hesabı/kredi kartı/araç/entegrasyon yazamaz; resepsiyon klinik bilgisini okuyabilir", async () => {
    const { withTenant, sema } = await import("@/lib/db");
    for (const [rol, kullanici] of [["resepsiyon", resepsiyon1], ["terapist", terapist1]] as const) {
      const b = bag(K1.klinik, kullanici);
      await reddedilmeli(withTenant(b, (tx) => tx.insert(sema.klinikBankaHesaplari).values({ klinikId: K1.klinik, hesapTipi: "klinik", bankaAdi: "Yetkisiz", hesapSahibi: "", iban: "", sortOrder: 5 })), /row-level security/i);
      await reddedilmeli(withTenant(b, (tx) => tx.insert(sema.klinikKrediKartlari).values({ klinikId: K1.klinik, kartTipi: "klinik", kartAdi: "Yetkisiz", bankaAdi: "x", kartSahibi: "", sortOrder: 5 })), /row-level security/i);
      await reddedilmeli(withTenant(b, (tx) => tx.insert(sema.klinikArac).values({ klinikId: K1.klinik, marka: "x", model: "x", plaka: `YETKISIZ-${rol}` })), /row-level security/i);
      const guncellenen = await withTenant(b, (tx) => tx.update(sema.klinik).set({ unvan: "yetkisiz" }).where(eq(sema.klinik.id, K1.klinik)).returning({ id: sema.klinik.id }));
      expect(guncellenen, `${rol} klinik güncelleme`).toHaveLength(0);
      // entegrasyon ayarları (Paraşüt) yalnız klinik_admin'e görünür
      expect(await withTenant(b, (tx) => tx.select({ id: sema.klinikMuhasebeEntegrasyonu.klinikId }).from(sema.klinikMuhasebeEntegrasyonu)), `${rol} entegrasyon okuma`).toHaveLength(0);
    }
    const okuyan = await withTenant(bag(K1.klinik, resepsiyon1), (tx) => tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, K1.klinik)));
    expect(okuyan).toHaveLength(1);
    void randomUUID;
  });
});

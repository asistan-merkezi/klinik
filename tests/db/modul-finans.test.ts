// Modül 4 — ödeme / cari / finans: karakterizasyon (elle hesaplanmış sayılar), bütünlük (çift gönderim, eşzamanlılık, tutar doğrulaması),
// rol ve DEFINER RPC savunması, defter değişmezliği ve denetim izi. Gerçek eylem kodu + gerçek Postgres (FORCE RLS).
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ortamKur, personelKur, hastaKur, superBaglan, tenantBaglami, tenantdaCalistir, reddedilmeli, benzersizTelefon } from "./yardimci";
import { oturumAc } from "./oturum-durumu";
import { sql as drizzleSql } from "drizzle-orm";
import { rpc, sema, withTenant } from "@/lib/db";
import { kurus, kurusMetni, yuzdeDus, yuzdeKurus } from "@/lib/para";
import { hesaplaDonemOzeti, hesaplaGunlukDokum, hesaplaYillikOzet } from "@/lib/raporlar/hesaplamalar";
import { raporAyDonemi } from "@/lib/raporlar/donem";
import { odemeAl, bakiyeHareketiEkle, hastaIadesiVer } from "@/app/(app)/panel/hastalar/[id]/actions";
import { kasaBaslangicGuncelle, kasaDengelemeEkle, kasayaGirenEkle, nakitBankaHareketiSil } from "@/app/(app)/panel/finans/kasa/actions";
import { bankayaGirenEkle } from "@/app/(app)/panel/finans/banka/actions";
import { giderEkle } from "@/app/(app)/panel/finans/giderler/actions";
import { cariOdemeEkle } from "@/app/(app)/panel/finans/giderler/tedarikciler/actions";
import { finansBorcDuzenle } from "@/app/(app)/panel/finans/gelirler-takibi/faturalar/actions";
import { islemTanimiOlustur } from "@/app/(app)/panel/islemler/actions";
import { paketGuncelle, paketOlustur } from "@/app/(app)/panel/paketler/actions";
import { finansDonemiCoz } from "@/lib/finans/donem";
import {
  bankaDonemBasiBakiyeleri,
  hastaOdemeleriniGetir,
  kasaDonemBasiBakiyesi,
  krediKartiDonemBasiBakiyesi,
  kartBorcOzetleriniGetir,
} from "@/lib/finans/okuma";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

let F: string; // temiz finans kliniği
let K2: Record<string, string>;
let admin: string, muhasebe: string, resepsiyon: string, terapist: string, admin2: string;
let H1: string, H2: string, BANKA1: string, BANKA2: string, KART: string, ISLEM: string, PAKET: string, PERSONEL: string, TERAPIST: string, ODA: string;

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
type Rol = "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe";
const as = (id: string, k: string, rol: Rol) => oturumAc({ userId: id, klinikId: k, rol });
async function sql<T = Record<string, unknown>>(q: string, p: unknown[] = []): Promise<T[]> {
  const c = await superBaglan();
  try {
    return (await c.query(q, p)).rows as T[];
  } finally {
    await c.end();
  }
}
const yaz = (q: string, p: unknown[] = []) => tenantdaCalistir(F, (c) => c.query(q, p));
const tx = (kullanici: string) => tenantBaglami({ klinik: F, kullanici });

beforeAll(async () => {
  const o = ortamKur();
  K2 = o.ids.k2;
  F = randomUUID();
  await tenantdaCalistir(F, (c) => c.query("insert into klinik(id, ad, qr_kisa_kod) values ($1, 'finans-deneme', 'finansdeneme')", [F]));
  admin = (await personelKur({ klinikId: F, rol: "klinik_admin" })).id;
  muhasebe = (await personelKur({ klinikId: F, rol: "muhasebe" })).id;
  resepsiyon = (await personelKur({ klinikId: F, rol: "resepsiyon" })).id;
  terapist = (await personelKur({ klinikId: F, rol: "terapist" })).id;
  admin2 = (await personelKur({ klinikId: K2.klinik, rol: "klinik_admin" })).id;

  [H1, H2] = [(await hastaKur({ klinikId: F })).hastaId, (await hastaKur({ klinikId: F })).hastaId];
  [BANKA1, BANKA2, KART, ISLEM, PAKET, PERSONEL, TERAPIST, ODA] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  await yaz("insert into klinik_banka_hesaplari(id, klinik_id, banka_adi, hesap_sahibi, iban) values ($1, $2, 'B1', 'S', 'TR1'), ($3, $2, 'B2', 'S', 'TR2')", [BANKA1, F, BANKA2]);
  await yaz("insert into klinik_kredi_kartlari(id, klinik_id, kart_adi, banka_adi) values ($1, $2, 'Kart', 'Banka')", [KART, F]);
  await yaz("insert into islem_tanimi(id, klinik_id, ad, vita_fiyat, kdv_orani) values ($1, $2, 'Seans', 1000, 20)", [ISLEM, F]);
  await yaz("insert into paket(id, klinik_id, islem_tanimi_id, ad, seans_sayisi, fiyat) values ($1, $2, $3, 'Paket5', 5, 4000)", [PAKET, F, ISLEM]);
  await yaz("insert into personel(id, klinik_id, ad_soyad, gorev) values ($1, $2, 'Per Sonel', 'Terapist')", [PERSONEL, F]);
  await yaz("insert into terapist(id, klinik_id, personel_id) values ($1, $2, $3)", [TERAPIST, F, PERSONEL]);
  await yaz("insert into oda(id, klinik_id, ad) values ($1, $2, 'O')", [ODA, F]);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("para kuralı: SQL ↔ JS parity", () => {
  it("komisyon: JS yuzdeKurus, Postgres round(tutar*oran/100, 2) ile 400 rastgele çiftte AYNI sonucu verir", async () => {
    const c = await superBaglan();
    try {
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 400; i++) {
        const tutarKurus = 1 + Math.floor(rnd() * 5_000_000);
        const oranYuzluk = Math.floor(rnd() * 351); // 0.00 .. 3.50
        const tutar = kurusMetni(tutarKurus);
        const oran = (oranYuzluk / 100).toFixed(2);
        const sqlKomisyon = (await c.query("select round($1::numeric * $2::numeric / 100, 2)::text as k", [tutar, oran])).rows[0].k as string;
        expect(kurusMetni(yuzdeKurus(tutarKurus, oran)), `${tutar} × %${oran}`).toBe(sqlKomisyon);
        expect(kurusMetni(yuzdeDus(tutarKurus, oran)), `net ${tutar} × %${oran}`).toBe(
          (await c.query("select ($1::numeric - round($1::numeric * $2::numeric / 100, 2))::text as n", [tutar, oran])).rows[0].n
        );
      }
    } finally {
      await c.end();
    }
  });

  it("negatif ve yarım-yukarı sınır durumları SQL ile aynı", async () => {
    const c = await superBaglan();
    try {
      for (const [t, o] of [["0.01", "50"], ["0.05", "10"], ["1.005", "100"], ["-2.345", "100"]] as const) {
        const sqlSonuc = (await c.query("select round($1::numeric * $2::numeric / 100, 2)::text as k", [t, o])).rows[0].k as string;
        expect(kurusMetni(yuzdeKurus(kurus(t)!, o))).toBe(sqlSonuc);
      }
    } finally {
      await c.end();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("karakterizasyon: Kasa / Banka / Kredi Kartı dönem başı bakiyeleri (elle hesaplanmış)", () => {
  beforeAll(async () => {
    // Kart tahsilat ayarı: komisyon oranı ve tahsilat hesabı; kart ödemelerinde hesap + oran kopyası tetikleyiciyle yazılır.
    await yaz("update klinik set kredi_karti_tahsilat_banka_hesap_id = $1, kredi_karti_komisyon_orani = 2.5 where id = $2", [BANKA1, F]);
    const hb = (tur: string, tutar: string, yontem: string | null, zaman: string, hesap: string | null = null) =>
      yaz("insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, odeme_yontemi, banka_hesap_id, created_at, iade_istisna, iade_istisna_gerekcesi) values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)", [F, H1, tur, tutar, yontem, hesap, zaman, tur === "iade", tur === "iade" ? "fixture istisna" : null]);
    await hb("odeme", "1000.00", "nakit", "2026-09-10 12:00+03");
    await hb("iade", "100.00", "nakit", "2026-09-12 12:00+03");
    await hb("odeme", "2000.00", "banka_havalesi", "2026-09-05 12:00+03", BANKA1);
    await hb("odeme", "1000.00", "kredi_karti", "2026-09-06 12:00+03"); // %2.5 → komisyon 25.00
    await yaz("update klinik set kredi_karti_komisyon_orani = 3.5 where id = $1", [F]);
    await hb("odeme", "33.33", "kredi_karti", "2026-09-07 12:00+03"); // %3.5 → komisyon 1.17 (1.16655)
    await hb("iade", "200.00", "banka_havalesi", "2026-09-08 12:00+03", BANKA1);
    await hb("iade", "100.00", "kredi_karti", "2026-09-09 12:00+03");
    await hb("odeme", "30.00", "nakit", "2026-09-30 23:30+03"); // dönem öncesi (İstanbul gün sınırı)
    // Harcama
    const hr = (tutar: string, tarih: string, tip: string, hesap: string | null, kart: string | null, ted: string | null) =>
      yaz("insert into klinik_harcama(klinik_id, kategori, tutar, tarih, odeme_tipi, banka_hesap_id, kredi_karti_id, tedarikci_adi) values ($1, 'malzeme', $2, $3, $4, $5, $6, $7)", [F, tutar, tarih, tip, hesap, kart, ted]);
    await hr("200.00", "2026-09-15", "nakit", null, null, null);
    await hr("300.00", "2026-09-14", "havale", BANKA1, null, null);
    await hr("120.00", "2026-09-13", "kredi_karti", null, KART, null);
    await hr("500.00", "2026-09-12", "cari", null, null, "ACME");
    // Personel
    await yaz("insert into personel_hesap_hareket(klinik_id, personel_id, tur, tutar, tarih, odeme_tipi) values ($1, $2, 'avans', 150, '2026-09-16', 'nakit')", [F, PERSONEL]);
    await yaz("insert into personel_hesap_hareket(klinik_id, personel_id, tur, tutar, tarih, odeme_tipi, banka_hesap_id) values ($1, $2, 'odeme', 100, '2026-09-16', 'havale', $3)", [F, PERSONEL, BANKA1]);
    // Kasa/Banka manuel hareketler
    await yaz("insert into nakit_banka_hareketi(klinik_id, tip, hedef_kasa, tutar, tarih, karsi_taraf_adi) values ($1, 'gelen', true, 500, '2026-09-17', 'X')", [F]);
    await yaz("insert into nakit_banka_hareketi(klinik_id, tip, kaynak_kasa, hedef_banka_hesap_id, tutar, tarih) values ($1, 'hesaplar_arasi', true, $2, 300, '2026-09-18')", [F, BANKA1]);
    await yaz("insert into nakit_banka_hareketi(klinik_id, tip, hedef_banka_hesap_id, odeme_yontemi, tutar, tarih, karsi_taraf_adi) values ($1, 'gelen', $2, 'banka_havalesi', 100, '2026-09-19', 'Y')", [F, BANKA1]);
    await yaz("insert into nakit_banka_hareketi(klinik_id, tip, kaynak_banka_hesap_id, tutar, tarih, karsi_taraf_adi) values ($1, 'giden', $2, 50, '2026-09-20', 'Z')", [F, BANKA1]);
    await yaz("insert into kasa_dengeleme(klinik_id, tutar, ekleyen_ad, created_at) values ($1, 50, 'a', '2026-09-19 10:00+03'), ($1, -20, 'a', '2026-09-20 10:00+03')", [F]);
    // Cari / kart ödemeleri / kamusal
    await yaz("insert into klinik_cari_odeme(klinik_id, tedarikci_adi, tutar, tarih, odeme_tipi) values ($1, 'ACME', 80, '2026-09-20', 'nakit')", [F]);
    await yaz("insert into klinik_cari_odeme(klinik_id, tedarikci_adi, tutar, tarih, odeme_tipi, banka_hesap_id) values ($1, 'ACME', 70, '2026-09-20', 'havale', $2)", [F, BANKA1]);
    await yaz("insert into klinik_cari_odeme(klinik_id, tedarikci_adi, tutar, tarih, odeme_tipi, kredi_karti_id) values ($1, 'ACME', 40, '2026-09-20', 'kredi_karti', $2)", [F, KART]);
    await yaz("insert into klinik_kredi_karti_odeme(klinik_id, kredi_karti_id, tutar, tarih, odeme_tipi) values ($1, $2, 60, '2026-09-21', 'nakit')", [F, KART]);
    await yaz("insert into klinik_kredi_karti_odeme(klinik_id, kredi_karti_id, tutar, tarih, odeme_tipi, banka_hesap_id) values ($1, $2, 20, '2026-09-21', 'havale', $3)", [F, KART, BANKA1]);
    await yaz("insert into kamusal_odeme(klinik_id, odeme_tipi, tutar, donem_ay, donem_yil, vade_tarihi, odeme_tarihi, odeme_yontemi) values ($1, 'kdv', 40, 9, 2026, '2026-09-22', '2026-09-22', 'nakit')", [F]);
    await yaz("insert into kamusal_odeme(klinik_id, odeme_tipi, tutar, donem_ay, donem_yil, vade_tarihi, odeme_tarihi, odeme_yontemi, banka_hesap_id) values ($1, 'kdv', 30, 9, 2026, '2026-09-22', '2026-09-22', 'havale', $2)", [F, BANKA1]);
    await yaz("insert into kamusal_odeme(klinik_id, odeme_tipi, tutar, donem_ay, donem_yil, vade_tarihi) values ($1, 'sgk_primleri', 999, 9, 2026, '2026-09-30')", [F]);
    // Ekim sınırı: 10-01 00:30 İstanbul (09-30 21:30 UTC) → DÖNEMİN İÇİNDE
    await hb("odeme", "70.00", "nakit", "2026-10-01 00:30+03");
  });

  const ekim = () => finansDonemiCoz({ mod: "aylik", yil: "2026", ay: "10" });

  it("tetikleyici kart ödemesine hesap + oran kopyasını yazdı (%2.5 ve %3.5)", async () => {
    const r = await sql<{ tutar: string; komisyon_orani: string; banka_hesap_id: string }>("select tutar::text, komisyon_orani::text, banka_hesap_id from hasta_bakiye_hareket where klinik_id = $1 and odeme_yontemi = 'kredi_karti' and tur = 'odeme' order by created_at", [F]);
    expect(r.map((x) => [x.tutar, x.komisyon_orani, x.banka_hesap_id])).toEqual([["1000.00", "2.50", BANKA1], ["33.33", "3.50", BANKA1]]);
  });

  it("Kasa dönem başı = 630,00 (nakit tahsilat/iade, gider, personel, manuel, dengeleme, cari, kart, kamusal; 00:30 kaydı dönem içinde)", async () => {
    as(admin, F, "klinik_admin");
    const k = await withTenant(tx(admin), (t) => kasaDonemBasiBakiyesi(t, ekim()));
    expect(k).toBe(630);
  });

  it("Banka (B1) dönem başı = 2.637,16 (kart tahsilatı NET: 975,00 + 32,16); B2 = 0", async () => {
    const b = await withTenant(tx(admin), (t) => bankaDonemBasiBakiyeleri(t, ekim()));
    expect(b[BANKA1]).toBe(2637.16);
    expect(b[BANKA2]).toBe(0);
  });

  it("Kredi Kartı (POS mutabakat) dönem başı = 773,33; kart ödemesi bu defterde YOK", async () => {
    expect(await withTenant(tx(admin), (t) => krediKartiDonemBasiBakiyesi(t, ekim()))).toBe(773.33);
  });

  it("Kart borcu: harcama − kart ödemesi (tüm zamanlar): 120 + 40 = 160 harcama, 60 + 20 = 80 ödeme", async () => {
    const o = await withTenant(tx(admin), (t) => kartBorcOzetleriniGetir(t, F));
    const kart = o.find((x) => x.kredi_karti_id === KART)!;
    expect([kart.harcama, kart.odeme]).toEqual([160, 80]);
  });

  it("dönem başı bakiyeler yalnız klinik_admin + muhasebe; resepsiyon/terapist RPC'yi doğrudan çağıramaz ('yetkisiz')", async () => {
    for (const [kullanici, kabul] of [[muhasebe, true], [resepsiyon, false], [terapist, false]] as const) {
      const t = withTenant(tx(kullanici), (x) => rpc(x, "kasa_bakiye_once_toplam", { p_once_tarih: "2026-10-01" }));
      if (kabul) expect(await t).toHaveLength(1);
      else await reddedilmeli(t, /yetkisiz/);
    }
    await reddedilmeli(withTenant(tx(resepsiyon), (x) => rpc(x, "banka_bakiye_once_toplam_tumu", { p_once_tarih: "2026-10-01" })), /yetkisiz/);
    await reddedilmeli(withTenant(tx(terapist), (x) => rpc(x, "kredi_karti_bakiye_once_toplam", { p_once_tarih: "2026-10-01" })), /yetkisiz/);
  });

  it("başka kliniğin kullanıcısı bu kliniğin bakiyesini GÖRMEZ (kendi kliniği için hesaplanır → 0)", async () => {
    const b = await withTenant(tenantBaglami({ klinik: K2.klinik, kullanici: admin2 }), (t) => kasaDonemBasiBakiyesi(t, ekim()));
    expect(b).not.toBe(630);
  });

  it("hasta ödeme/iade listesi (Banka): havale + kart satırları döner, iade 'iade' olarak; tutarlar TL sayısı", async () => {
    const satirlar = await withTenant(tx(admin), (t) => hastaOdemeleriniGetir(t, finansDonemiCoz({ mod: "aylik", yil: "2026", ay: "9" }), ["banka_havalesi", "kredi_karti"]));
    expect(satirlar.map((s) => `${s.tur}:${s.odeme_yontemi}:${s.tutar}`).sort()).toEqual(
      ["iade:banka_havalesi:200", "iade:kredi_karti:100", "odeme:banka_havalesi:2000", "odeme:kredi_karti:1000", "odeme:kredi_karti:33.33"].sort()
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("karakterizasyon: Raporlar (Ekim 2026) — SQL tek doğruluk kaynağı", () => {
  const donem = raporAyDonemi(2026, 10);
  beforeAll(async () => {
    const hb = (tur: string, tutar: string, yontem: string | null, zaman: string, hesap: string | null = null) =>
      yaz("insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, odeme_yontemi, banka_hesap_id, created_at, iade_istisna, iade_istisna_gerekcesi) values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)", [F, H2, tur, tutar, yontem, hesap, zaman, tur === "iade", tur === "iade" ? "fixture istisna" : null]);
    await hb("odeme", "500.00", "nakit", "2026-10-05 10:00+03");
    await hb("odeme", "300.00", "kredi_karti", "2026-10-06 10:00+03");
    await hb("odeme", "200.00", "banka_havalesi", "2026-10-07 10:00+03", BANKA1);
    await hb("odeme", "50.00", null, "2026-10-08 10:00+03"); // yöntemi belirtilmemiş
    await hb("iade", "80.00", "nakit", "2026-10-09 10:00+03");
    const hr = (kategori: string, tutar: string, tarih: string, faturali: boolean) =>
      yaz("insert into klinik_harcama(klinik_id, kategori, tutar, tarih, is_faturali, odeme_tipi) values ($1, $2, $3, $4, $5, 'nakit')", [F, kategori, tutar, tarih, faturali]);
    await hr("kira", "1000.00", "2026-10-03", false);
    await hr("diger", "250.00", "2026-10-04", false);
    await hr("malzeme", "400.00", "2026-10-05", true);
    await yaz("insert into kamusal_odeme(klinik_id, odeme_tipi, tutar, donem_ay, donem_yil, vade_tarihi, odeme_tarihi, odeme_yontemi) values ($1, 'kdv', 600, 10, 2026, '2026-10-10', '2026-10-10', 'nakit')", [F]);
    const rd = (durum: string, saat: string) =>
      yaz("insert into randevu(klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis, durum) values ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz + interval '30 minutes', $6)", [F, H2, TERAPIST, ODA, `2026-10-12 ${saat}+03`, durum]);
    await rd("tamamlandi", "09:00");
    await rd("geldi", "10:00");
    await rd("planlandi", "11:00");
    await rd("ertelendi", "12:00");
    await rd("iptal", "13:00");
    await rd("gelmedi", "14:00");
  });

  it("dönem özeti: gelir kırılımı, 4 gider kalemi ve randevu durumları elle hesaplanan değerlerle birebir", async () => {
    const o = await withTenant(tx(admin), (t) => hesaplaDonemOzeti(t, donem));
    // nakit 500 + 70 (00:30 kaydı Ekim'e düşer) = 570; net = 570 + 300 + 200 + 50 − 80 = 1040
    expect(o.gelir).toEqual({ nakit: 570, krediKarti: 300, bankaHavalesi: 200, belirtilmemis: 50, iade: 80, netTahsilat: 1040 });
    expect([o.isletmeGideri, o.digerGiderler, o.faturaliGiderler, o.muhasebeGideri]).toEqual([1000, 250, 400, 600]); // ödenmemiş 999 SAYILMAZ
    expect(o.randevuDurumu).toEqual({ tamamlanan: 2, planlanan: 1, ertelenen: 1, iptalVeGelmedi: 2, toplam: 6 });
  });

  it("yıllık özet: Eylül ve Ekim ayları elle hesaplanan gelir/gider/seans", async () => {
    const aylar = await withTenant(tx(admin), (t) => hesaplaYillikOzet(t, 2026));
    // Eylül gelir: 1000 + 2000 + 1000 + 33.33 + 30 − 100 − 200 − 100 = 3663.33; gider: harcama 200+300+120+500 + kamusal ödenmiş 40+30 = 1190
    expect([aylar[8].gelir, aylar[8].gider, aylar[8].seansSayisi]).toEqual([3663.33, 1190, 0]);
    expect([aylar[9].gelir, aylar[9].gider, aylar[9].seansSayisi]).toEqual([1040, 2250, 2]);
    expect(aylar).toHaveLength(12);
  });

  it("Günlük Döküm gün toplamları SQL toplamlarıyla MUTABIK (gelir=net tahsilat, gider=4 kalem toplamı)", async () => {
    const [ozet, dokum] = await withTenant(tx(admin), async (t) => [await hesaplaDonemOzeti(t, donem), await hesaplaGunlukDokum(t, donem)] as const);
    const gelir = dokum.reduce((a, g) => a + Math.round(g.gelir * 100), 0) / 100;
    const gider = dokum.reduce((a, g) => a + Math.round(g.gider * 100), 0) / 100;
    expect(gelir).toBe(ozet.gelir.netTahsilat);
    expect(gider).toBe(ozet.isletmeGideri + ozet.digerGiderler + ozet.faturaliGiderler + ozet.muhasebeGideri);
    expect(dokum.reduce((a, g) => a + g.seansSayisi, 0)).toBe(2);
  });

  it("Raporlar RPC'si FORCE RLS altında yalnız kendi kliniğini toplar (başka klinik 0'dan başlar)", async () => {
    const o = await withTenant(tenantBaglami({ klinik: K2.klinik, kullanici: admin2 }), (t) => hesaplaDonemOzeti(t, donem));
    expect(o.gelir.netTahsilat).toBe(0);
    expect(o.muhasebeGideri).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("karakterizasyon: hasta bakiye view'ları (v_hasta_ozet / v_hasta_cari_ozet)", () => {
  let H: string;
  beforeAll(async () => {
    H = (await hastaKur({ klinikId: F })).hastaId;
    const ekle = (tur: string, tutar: string, iskonto = "0") =>
      yaz("insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, iskonto_tutari, odeme_yontemi, iade_istisna, iade_istisna_gerekcesi) values ($1, $2, $3, $4, $5, $6, $7, $8)", [F, H, tur, tutar, iskonto, tur === "iade" ? "nakit" : null, tur === "iade", tur === "iade" ? "fixture istisna" : null]);
    await ekle("borc", "1000.00", "100.00"); // net 900
    await ekle("borc", "500.00"); // 500
    await ekle("odeme", "400.00");
    await ekle("odeme", "100.00");
    await ekle("iade", "50.00");
    await ekle("kredi", "25.00");
  });

  it("bakiye = −(900 + 500) + (400 + 100) − 50 + 25 = −925 ; cari ozet: borç 1400, tahsil 475, kalan 925", async () => {
    const v = await sql<{ bakiye: string }>("select bakiye::text from v_hasta_ozet where hasta_id = $1", [H]);
    expect(v[0].bakiye).toBe("-925.00");
    const c = await sql<{ toplam_bakiye: string; tahsil_edilen: string; kalan_bakiye: string }>("select toplam_bakiye::text, tahsil_edilen::text, kalan_bakiye::text from v_hasta_cari_ozet where hasta_id = $1", [H]);
    expect(c[0]).toEqual({ toplam_bakiye: "1400.00", tahsil_edilen: "475.00", kalan_bakiye: "925.00" });
  });

  it("peşin ödeme_olustur satışı (odeme_id dolu ödeme satırı) bakiyeyi DEĞİŞTİRMEZ; paket satışı borç yazar (peşin değil)", async () => {
    as(admin, F, "klinik_admin");
    const onceki = (await sql<{ bakiye: string }>("select bakiye::text from v_hasta_ozet where hasta_id = $1", [H]))[0].bakiye;
    const s = await odemeAl(H, null, fd({ iskonto_tutari: "0", kalemler_json: JSON.stringify([{ tur: "islem", ref_id: ISLEM, miktar: 1 }]), satirlar_json: JSON.stringify([{ yontem: "nakit", tutar: 1000 }]) }));
    expect(s?.success, s?.message).toBe(true);
    expect((await sql<{ bakiye: string }>("select bakiye::text from v_hasta_ozet where hasta_id = $1", [H]))[0].bakiye).toBe(onceki);
    const p = await odemeAl(H, null, fd({ iskonto_tutari: "250.50", kalemler_json: JSON.stringify([{ tur: "paket", ref_id: PAKET, miktar: 1 }]), satirlar_json: JSON.stringify([{ yontem: "nakit", tutar: 3749.5 }]) }));
    expect(p?.success, p?.message).toBe(true);
    // borç 4000, iskonto 250.50 → net 3749.50 borç
    expect((await sql<{ bakiye: string }>("select bakiye::text from v_hasta_ozet where hasta_id = $1", [H]))[0].bakiye).toBe("-4674.50");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("bütünlük: tutar doğrulaması, çift gönderim, eşzamanlılık", () => {
  let H: string;
  const bakiye = async () => (await sql<{ bakiye: string }>("select bakiye::text from v_hasta_ozet where hasta_id = $1", [H]))[0].bakiye;
  beforeAll(async () => {
    H = (await hastaKur({ klinikId: F })).hastaId;
  });

  it("sıfır, negatif, harf ve 3+ ondalıklı tutar reddedilir; hiçbir satır yazılmaz", async () => {
    as(resepsiyon, F, "resepsiyon");
    for (const tutar of ["0", "-5", "abc", "10.005", "", "1e3"]) {
      const s = await bakiyeHareketiEkle(H, null, fd({ tur: "odeme", tutar, tarih: "2026-10-20", odeme_yontemi: "nakit" }));
      expect(s?.success, `tutar=${tutar}`).toBe(false);
    }
    const i = await hastaIadesiVer(H, null, fd({ tutar: "-1", tarih: "2026-10-20", odeme_yontemi: "nakit" }));
    expect(i?.success).toBe(false);
    expect((await sql("select 1 from hasta_bakiye_hareket where hasta_id = $1", [H])).length).toBe(0);
  });

  it("0,10 + 0,20 ödemesi tam 0,30 olur (float hatası yok)", async () => {
    as(resepsiyon, F, "resepsiyon");
    for (const t of ["0.10", "0,20"]) expect((await bakiyeHareketiEkle(H, null, fd({ tur: "odeme", tutar: t, tarih: "2026-10-20", odeme_yontemi: "nakit" })))?.success).toBe(true);
    expect(await bakiye()).toBe("0.30");
  });

  it("AYNI istek anahtarıyla çift gönderim tek kayıt yazar; farklı anahtar yeni kayıt", async () => {
    as(resepsiyon, F, "resepsiyon");
    const onceki = (await sql("select 1 from hasta_bakiye_hareket where hasta_id = $1", [H])).length;
    const anahtar = randomUUID();
    const form = () => fd({ tur: "odeme", tutar: "11.00", tarih: "2026-10-21", odeme_yontemi: "nakit", islem_anahtari: anahtar });
    const a = await bakiyeHareketiEkle(H, null, form());
    const b = await bakiyeHareketiEkle(H, null, form());
    expect([a?.success, b?.success]).toEqual([true, true]);
    expect((await sql("select 1 from hasta_bakiye_hareket where hasta_id = $1", [H])).length).toBe(onceki + 1);
    expect((await bakiyeHareketiEkle(H, null, fd({ tur: "odeme", tutar: "11.00", tarih: "2026-10-21", odeme_yontemi: "nakit", islem_anahtari: randomUUID() })))?.success).toBe(true);
    expect((await sql("select 1 from hasta_bakiye_hareket where hasta_id = $1", [H])).length).toBe(onceki + 2);
  });

  it("EŞZAMANLI çift gönderim (aynı anahtar): tam bir kayıt; eşzamanlı iki FARKLI ödeme: ikisi de yazılır, bakiye tam", async () => {
    as(resepsiyon, F, "resepsiyon");
    const onceki = (await sql("select 1 from hasta_bakiye_hareket where hasta_id = $1", [H])).length;
    const bakiyeOnce = kurus(await bakiye())!;
    const anahtar = randomUUID();
    const ayni = () => bakiyeHareketiEkle(H, null, fd({ tur: "odeme", tutar: "5.55", tarih: "2026-10-22", odeme_yontemi: "nakit", islem_anahtari: anahtar }));
    await Promise.all([ayni(), ayni(), ayni()]);
    expect((await sql("select 1 from hasta_bakiye_hareket where hasta_id = $1", [H])).length).toBe(onceki + 1);
    const iki = (t: string) => bakiyeHareketiEkle(H, null, fd({ tur: "odeme", tutar: t, tarih: "2026-10-22", odeme_yontemi: "nakit", islem_anahtari: randomUUID() }));
    const [x, y] = await Promise.all([iki("7.10"), iki("2.20")]);
    expect([x?.success, y?.success]).toEqual([true, true]);
    expect(kurus(await bakiye())).toBe(bakiyeOnce + 555 + 710 + 220);
  });

  it("odemeAl çift gönderimi: aynı anahtarla tek ödeme (odeme + hareket)", async () => {
    as(admin, F, "klinik_admin");
    const onceki = (await sql<{ n: string }>("select count(*)::text n from odeme where hasta_id = $1", [H]))[0].n;
    const anahtar = randomUUID();
    const form = () => fd({ iskonto_tutari: "0", kalemler_json: JSON.stringify([{ tur: "islem", ref_id: ISLEM, miktar: 1 }]), satirlar_json: JSON.stringify([{ yontem: "nakit", tutar: 1000 }]), islem_anahtari: anahtar });
    const sonuc = await Promise.all([odemeAl(H, null, form()), odemeAl(H, null, form())]);
    expect(sonuc.map((s) => s?.success)).toEqual([true, true]);
    expect((await sql<{ n: string }>("select count(*)::text n from odeme where hasta_id = $1", [H]))[0].n).toBe(String(Number(onceki) + 1));
  });

  it("ödeme satırları toplamı net tutara eşit değilse atomik reddedilir (odeme/kalem/satır/hareket yazılmaz)", async () => {
    as(admin, F, "klinik_admin");
    const o = await sql<{ n: string }>("select count(*)::text n from odeme where hasta_id = $1", [H]);
    const s = await odemeAl(H, null, fd({ iskonto_tutari: "0", kalemler_json: JSON.stringify([{ tur: "islem", ref_id: ISLEM, miktar: 1 }]), satirlar_json: JSON.stringify([{ yontem: "nakit", tutar: 999.99 }]) }));
    expect(s?.success).toBe(false);
    expect(s?.message).toMatch(/eşit olmalı/);
    expect((await sql<{ n: string }>("select count(*)::text n from odeme where hasta_id = $1", [H]))[0].n).toBe(o[0].n);
    // iskonto > toplam
    const t = await odemeAl(H, null, fd({ iskonto_tutari: "1500", kalemler_json: JSON.stringify([{ tur: "islem", ref_id: ISLEM, miktar: 1 }]), satirlar_json: JSON.stringify([{ yontem: "nakit", tutar: 1 }]) }));
    expect(t?.success).toBe(false);
  });

  // ---- Modül 4a: iade sınırı (0013) ----
  const odemeYaz = async (hasta: string, tutar: string, yontem = "nakit") => {
    const r = await sql<{ id: string }>(
      "insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, odeme_yontemi) values ($1, $2, 'odeme', $3, $4) returning id",
      [F, hasta, tutar, yontem]
    ).catch(async () => {
      // süper bağlantı tenant GUC'siz FORCE RLS'e takılır → tenant bağlamlı yaz
      return tenantdaCalistir(F, async (c) => (await c.query("insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, odeme_yontemi) values ($1, $2, 'odeme', $3, $4) returning id", [F, hasta, tutar, yontem])).rows as { id: string }[]);
    });
    return r[0].id;
  };
  const iadeForm = (kaynak: string, tutar: string, ek: Record<string, string> = {}) => fd({ tutar, tarih: "2026-10-23", kaynak_hareket_id: kaynak, islem_anahtari: randomUUID(), ...ek });

  it("iade ödemenin kalanını aşamaz: 100 ödeme → 60 + 40 olur, sonrası (0,01) reddedilir; yöntem kaynaktan gelir", async () => {
    const odeme = await odemeYaz(H, "100.00", "kredi_karti");
    as(resepsiyon, F, "resepsiyon");
    const ilk = await hastaIadesiVer(H, null, iadeForm(odeme, "60.00", { odeme_yontemi: "nakit" })); // istemci "nakit" dese de yöntem kaynaktan
    expect(ilk?.success, ilk?.message).toBe(true);
    expect((await sql<{ y: string; k: string }>("select odeme_yontemi y, kaynak_hareket_id k from hasta_bakiye_hareket where hasta_id = $1 and tur = 'iade' order by created_at desc limit 1", [H]))[0]).toEqual({ y: "kredi_karti", k: odeme });
    const asan = await hastaIadesiVer(H, null, iadeForm(odeme, "40.01"));
    expect(asan?.success).toBe(false);
    expect(asan?.message).toMatch(/kalanını \(.*40,00.*\) aşamaz/);
    expect((await hastaIadesiVer(H, null, iadeForm(odeme, "40.00")))?.success).toBe(true);
    expect((await hastaIadesiVer(H, null, iadeForm(odeme, "0.01")))?.success).toBe(false);
  });

  it("iade kaynağı geçerli olmalı: başka hastanın / iade / borç satırı, olmayan kimlik; kaynak seçilmeden iade yapılamaz", async () => {
    const baska = (await hastaKur({ klinikId: F })).hastaId;
    const baskaOdeme = await odemeYaz(baska, "50.00");
    as(resepsiyon, F, "resepsiyon");
    expect((await hastaIadesiVer(H, null, iadeForm(baskaOdeme, "10")))?.success).toBe(false);
    expect((await hastaIadesiVer(H, null, iadeForm(randomUUID(), "10")))?.success).toBe(false);
    const borc = (await sql<{ id: string }>("select id from hasta_bakiye_hareket where hasta_id = $1 and tur = 'iade' limit 1", [H]))[0].id;
    expect((await hastaIadesiVer(H, null, iadeForm(borc, "1")))?.success).toBe(false);
    expect((await hastaIadesiVer(H, null, fd({ tutar: "5.00", tarih: "2026-10-23" })))?.message).toBe("İade edilecek ödeme seçilmeli.");
  });

  it("EŞZAMANLI iki iade (kalan 100, 60 + 60): tam biri başarılı, toplam kaynağı aşmaz", async () => {
    const odeme = await odemeYaz(H, "100.00");
    as(resepsiyon, F, "resepsiyon");
    const sonuc = await Promise.all([hastaIadesiVer(H, null, iadeForm(odeme, "60.00")), hastaIadesiVer(H, null, iadeForm(odeme, "60.00"))]);
    expect(sonuc.filter((x) => x?.success)).toHaveLength(1);
    expect((await sql<{ t: string }>("select sum(tutar)::text t from hasta_bakiye_hareket where kaynak_hareket_id = $1", [odeme]))[0].t).toBe("60.00");
  });

  it("DB seviyesi: aşan iade 'iade_asimi', yöntem uyuşmazlığı 'iade_kaynak_gecersiz'; kaynaksız/istisnasız iade CHECK'e takılır", async () => {
    const odeme = await odemeYaz(H, "30.00", "nakit");
    const ekle = (tutar: string, yontem: string, kaynak: string | null, istisna = false, gerekce: string | null = null) =>
      withTenant(tx(admin), (t) =>
        t.insert(sema.hastaBakiyeHareket).values({ klinikId: F, hastaId: H, tur: "iade", tutar, odemeYontemi: yontem as "nakit", kaynakHareketId: kaynak, iadeIstisna: istisna, iadeIstisnaGerekcesi: gerekce })
      );
    await reddedilmeli(ekle("30.01", "nakit", odeme), /iade_asimi:kalan=30\.00/);
    await reddedilmeli(ekle("10", "kredi_karti", odeme), /iade_kaynak_gecersiz/);
    await reddedilmeli(ekle("10", "nakit", null), /iade_kaynak_gecersiz/); // kaynaksız + istisnasız: tetikleyici reddeder
    await reddedilmeli(ekle("10", "nakit", null, true, "kısa"), /check constraint/);
    await reddedilmeli(ekle("10", "nakit", odeme, true, "uzun bir gerekçe"), /check constraint/);
    await ekle("30", "nakit", odeme);
  });

  it("İSTİSNA iade: resepsiyon yapamaz (eylem + DB); klinik_admin gerekçeyle yapar; gerekçesiz reddedilir; audit'te görünür", async () => {
    as(resepsiyon, F, "resepsiyon");
    const r = await hastaIadesiVer(H, null, fd({ tutar: "25.00", tarih: "2026-10-23", istisna: "on", istisna_gerekcesi: "arşiv ödemesi", odeme_yontemi: "nakit" }));
    expect(r?.success).toBe(false);
    await reddedilmeli(
      withTenant(tx(resepsiyon), (t) => t.insert(sema.hastaBakiyeHareket).values({ klinikId: F, hastaId: H, tur: "iade", tutar: "25.00", odemeYontemi: "nakit", iadeIstisna: true, iadeIstisnaGerekcesi: "arşiv ödemesi" })),
      /iade_istisna_yetkisiz/
    );
    as(admin, F, "klinik_admin");
    expect((await hastaIadesiVer(H, null, fd({ tutar: "25.00", tarih: "2026-10-23", istisna: "on", odeme_yontemi: "nakit" })))?.success).toBe(false);
    const once = kurus(await bakiye())!;
    const ok = await hastaIadesiVer(H, null, fd({ tutar: "25.00", tarih: "2026-10-23", istisna: "on", istisna_gerekcesi: "arşivden aktarılan ödeme", odeme_yontemi: "nakit", islem_anahtari: randomUUID() }));
    expect(ok?.success, ok?.message).toBe(true);
    expect(kurus(await bakiye())).toBe(once - 2500); // alacağı aşan istisna iade de bakiyeyi düşürür (iş kuralı)
    const iz = await sql<{ detay: { yeni?: { iade_istisna?: boolean; iade_istisna_gerekcesi?: string } } }>(
      "select detay from audit_log where hedef_tablo = 'hasta_bakiye_hareket' and klinik_id = $1 and detay->'yeni'->>'iade_istisna_gerekcesi' = 'arşivden aktarılan ödeme'", [F]
    );
    expect(iz.length).toBeGreaterThan(0);
  });

  it("iade seçenekleri: yalnız kalan > 0 ödemeler; istisna yetkisi yalnız klinik_admin", async () => {
    const { iadeSecenekleriGetir } = await import("@/app/(app)/panel/hastalar/[id]/actions");
    const yeni = (await hastaKur({ klinikId: F })).hastaId;
    const o1 = await odemeYaz(yeni, "80.00");
    await odemeYaz(yeni, "20.00", "banka_havalesi").catch(() => undefined);
    as(resepsiyon, F, "resepsiyon");
    expect((await hastaIadesiVer(yeni, null, iadeForm(o1, "80.00")))?.success).toBe(true);
    const r = await iadeSecenekleriGetir(yeni);
    expect(r.odemeler.map((o) => o.id)).not.toContain(o1);
    expect(r.istisnaYapabilir).toBe(false);
    as(admin, F, "klinik_admin");
    expect((await iadeSecenekleriGetir(yeni)).istisnaYapabilir).toBe(true);
  });

  it("havale ödemesi/iadesi başka kliniğin banka hesabıyla yazılamaz; hesap yoksa reddedilir", async () => {
    as(resepsiyon, F, "resepsiyon");
    const yabanci = (await sql<{ id: string }>("select id from klinik_banka_hesaplari where klinik_id = $1 limit 1", [K2.klinik]))[0]?.id ?? randomUUID();
    const s = await bakiyeHareketiEkle(H, null, fd({ tur: "odeme", tutar: "10.00", tarih: "2026-10-23", odeme_yontemi: "banka_havalesi", banka_hesap_id: yabanci }));
    expect(s?.success).toBe(false);
    as(admin, F, "klinik_admin");
    const i = await hastaIadesiVer(H, null, fd({ tutar: "10.00", tarih: "2026-10-23", istisna: "on", istisna_gerekcesi: "yabancı hesap denemesi", odeme_yontemi: "banka_havalesi", banka_hesap_id: yabanci }));
    expect(i?.success).toBe(false);
  });

  it("cari ödemesi EŞZAMANLI: bakiye 100 iken iki adet 60 → tam biri başarılı, toplam bakiyeyi aşmaz", async () => {
    as(admin, F, "klinik_admin");
    expect((await giderEkle(null, fd({ tarih: "2026-10-24", kategori: "malzeme", tutar: "100.00", tedarikci_adi: "Yarış A.Ş.", odeme_tipi: "cari" })))?.success).toBe(true);
    const odeme = () => cariOdemeEkle(null, fd({ tedarikci_adi: "Yarış A.Ş.", tutar: "60.00", tarih: "2026-10-24", odeme_tipi: "nakit", islem_anahtari: randomUUID() }));
    const sonuc = await Promise.all([odeme(), odeme()]);
    expect(sonuc.filter((s) => s?.success)).toHaveLength(1);
    expect(sonuc.find((s) => !s?.success)?.message).toMatch(/aşıyor/);
    const toplam = (await sql<{ t: string }>("select coalesce(sum(tutar),0)::text t from klinik_cari_odeme where klinik_id = $1 and tedarikci_adi = 'Yarış A.Ş.'", [F]))[0].t;
    expect(toplam).toBe("60.00");
    // aynı anahtarla çift cari ödeme tek kayıt
    const anahtar = randomUUID();
    const f = () => cariOdemeEkle(null, fd({ tedarikci_adi: "Yarış A.Ş.", tutar: "10.00", tarih: "2026-10-24", odeme_tipi: "nakit", islem_anahtari: anahtar }));
    await Promise.all([f(), f()]);
    expect((await sql<{ t: string }>("select coalesce(sum(tutar),0)::text t from klinik_cari_odeme where klinik_id = $1 and tedarikci_adi = 'Yarış A.Ş.'", [F]))[0].t).toBe("70.00");
  });

  it("kasa dengelemesi: sıfır reddedilir, işaretli tutar yazılır; manuel giren çift gönderimi tek kayıt", async () => {
    as(admin, F, "klinik_admin");
    expect((await kasaDengelemeEkle(null, fd({ tutar: "0" })))?.success).toBe(false);
    expect((await kasaDengelemeEkle(null, fd({ tutar: "-12,50", aciklama: "fark" })))?.success).toBe(true);
    expect((await sql<{ t: string }>("select tutar::text t from kasa_dengeleme where klinik_id = $1 and aciklama = 'fark'", [F]))[0].t).toBe("-12.50");
    const anahtar = randomUUID();
    const g = () => kasayaGirenEkle(null, fd({ karsi_taraf_adi: "Çift", tutar: "3.00", tarih: "2026-10-25", islem_anahtari: anahtar }));
    await Promise.all([g(), g(), g()]);
    expect((await sql("select 1 from nakit_banka_hareketi where klinik_id = $1 and karsi_taraf_adi = 'Çift'", [F])).length).toBe(1);
  });

  it("işlem anahtarı temizliği: uygulama rolü yalnız 2 günden ESKİ anahtarları silebilir (taze anahtar silinemez); başka kliniğinkini göremez", async () => {
    const eski = randomUUID();
    const taze = randomUUID();
    await yaz("insert into islem_anahtari(klinik_id, anahtar, islem, olusturma) values ($1, $2, 't', now() - interval '3 days'), ($1, $3, 't', now())", [F, eski, taze]);
    const silinen = await withTenant(tx(admin), (t) => t.execute(drizzleSql`delete from islem_anahtari where anahtar in (${eski}, ${taze}) returning anahtar`));
    expect(silinen.rows.map((r) => r.anahtar)).toEqual([eski]);
    const kalan = await withTenant(tenantBaglami({ klinik: K2.klinik, kullanici: admin2 }), (t) => t.execute(drizzleSql`select 1 from islem_anahtari where anahtar = ${taze}`));
    expect(kalan.rows).toHaveLength(0);
  });

  it("işlem anahtarı kliniğe özgüdür: başka klinik aynı anahtarı kullanabilir", async () => {
    const anahtar = randomUUID();
    as(admin, F, "klinik_admin");
    expect((await kasayaGirenEkle(null, fd({ karsi_taraf_adi: "A", tutar: "1", tarih: "2026-10-25", islem_anahtari: anahtar })))?.success).toBe(true);
    as(admin2, K2.klinik, "klinik_admin");
    expect((await kasayaGirenEkle(null, fd({ karsi_taraf_adi: "B", tutar: "1", tarih: "2026-10-25", islem_anahtari: anahtar })))?.success).toBe(true);
    expect((await sql("select 1 from nakit_banka_hareketi where klinik_id = $1 and karsi_taraf_adi = 'B'", [K2.klinik])).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("rol ve yetki (eylemler + DEFINER RPC'ler)", () => {
  let H: string;
  beforeAll(async () => {
    H = (await hastaKur({ klinikId: F })).hastaId;
  });

  it("Kasa/Banka/Gider yazma yalnız klinik_admin: resepsiyon, muhasebe, terapist reddedilir", async () => {
    for (const [id, rol] of [[resepsiyon, "resepsiyon"], [muhasebe, "muhasebe"], [terapist, "terapist"]] as const) {
      as(id, F, rol);
      expect(await kasayaGirenEkle(null, fd({ karsi_taraf_adi: "X", tutar: "1", tarih: "2026-10-25" })), rol).toEqual({ success: false, message: YETKISIZ_MESAJI });
      expect((await bankayaGirenEkle(null, fd({ hedef_banka_hesap_id: BANKA1, odeme_yontemi: "nakit", karsi_taraf_adi: "X", tutar: "1", tarih: "2026-10-25" })))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await giderEkle(null, fd({ tarih: "2026-10-25", kategori: "kira", tutar: "1" })))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await kasaBaslangicGuncelle(null, fd({ baslangic_tutari: "1" })))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await nakitBankaHareketiSil(randomUUID()))?.message, rol).toBe(YETKISIZ_MESAJI);
    }
  });

  it("hasta ödeme/iade/bakiye yalnız klinik_admin + resepsiyon; muhasebe ve terapist reddedilir", async () => {
    for (const [id, rol] of [[muhasebe, "muhasebe"], [terapist, "terapist"]] as const) {
      as(id, F, rol);
      expect((await bakiyeHareketiEkle(H, null, fd({ tur: "odeme", tutar: "1", tarih: "2026-10-25", odeme_yontemi: "nakit" })))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await hastaIadesiVer(H, null, fd({ tutar: "1", tarih: "2026-10-25", odeme_yontemi: "nakit" })))?.message, rol).toBe(YETKISIZ_MESAJI);
      expect((await odemeAl(H, null, fd({ iskonto_tutari: "0", kalemler_json: JSON.stringify([{ tur: "islem", ref_id: ISLEM }]), satirlar_json: JSON.stringify([{ yontem: "nakit", tutar: 1000 }]) })))?.message, rol).toBe(YETKISIZ_MESAJI);
    }
  });

  it("muhasebe yalnız fatura kesme eylemini kullanabilir (finansBorcDuzenle); terapist kullanamaz", async () => {
    const borc = (await sql<{ id: string }>("select id from hasta_bakiye_hareket where klinik_id = $1 and tur = 'borc' limit 1", [F]))[0].id;
    as(muhasebe, F, "muhasebe");
    const m = await finansBorcDuzenle(borc, null, fd({ iskonto_tutari: "0" }));
    expect(m?.message).not.toBe(YETKISIZ_MESAJI);
    as(terapist, F, "terapist");
    expect((await finansBorcDuzenle(borc, null, fd({ iskonto_tutari: "0" })))?.message).toBe(YETKISIZ_MESAJI);
  });

  it("terapist yönetim finansını GÖREMEZ (RLS): harcama, kasa dengeleme, nakit/banka hareketi, kamusal ödeme, cari ve kart ödemeleri", async () => {
    for (const tablo of [sema.klinikHarcama, sema.kasaDengeleme, sema.nakitBankaHareketi, sema.kamusalOdeme, sema.klinikCariOdeme, sema.klinikKrediKartiOdeme]) {
      const satirlar = await withTenant(tx(terapist), (t) => t.select().from(tablo).limit(5));
      expect(satirlar, String((tablo as unknown as { _: { name: string } })._?.name)).toHaveLength(0);
    }
  });

  it("4c (0017): hasta cari defteri terapist için OKUNAMAZ (0 satır) ve YAZILAMAZ; ayrıntı: tests/db/modul-terapist-finans.test.ts", async () => {
    expect((await withTenant(tx(terapist), (t) => t.select().from(sema.hastaBakiyeHareket).limit(1))).length).toBe(0);
    await reddedilmeli(withTenant(tx(terapist), (t) => t.insert(sema.hastaBakiyeHareket).values({ klinikId: F, hastaId: H, tur: "odeme", tutar: "1.00", odemeYontemi: "nakit" })), /row-level security|permission denied/);
  });

  it("muhasebe finans defterini OKUR ama YAZAMAZ (RLS)", async () => {
    expect((await withTenant(tx(muhasebe), (t) => t.select().from(sema.klinikHarcama).limit(1))).length).toBe(1);
    await reddedilmeli(withTenant(tx(muhasebe), (t) => t.insert(sema.klinikHarcama).values({ klinikId: F, kategori: "kira", tutar: "1", tarih: "2026-10-25" })), /row-level security|permission denied/);
  });

  it("DEFINER RPC'ler içeride rol + tenant kontrolü yapar (doğrudan çağrı)", async () => {
    // odeme_olustur: muhasebe/terapist 'yetkisiz'; başka kliniğin hastası 'hasta_bulunamadi'
    const kalem = JSON.stringify([{ tur: "islem", ref_id: ISLEM, miktar: 1 }]);
    const satir = JSON.stringify([{ yontem: "nakit", tutar: "1000.00" }]);
    for (const k of [muhasebe, terapist]) {
      await reddedilmeli(withTenant(tx(k), (t) => rpc(t, "odeme_olustur", { p_hasta_id: H, p_iskonto_tutari: "0", p_faturali: false, p_aciklama: null, p_kalemler: JSON.parse(kalem), p_satirlar: JSON.parse(satir) })), /yetkisiz/);
    }
    await reddedilmeli(
      withTenant(tenantBaglami({ klinik: K2.klinik, kullanici: admin2 }), (t) => rpc(t, "odeme_olustur", { p_hasta_id: H, p_iskonto_tutari: "0", p_faturali: false, p_aciklama: null, p_kalemler: JSON.parse(kalem), p_satirlar: JSON.parse(satir) })),
      /hasta_bulunamadi/
    );
    // klinik_cari_odeme_ekle: yalnız klinik_admin
    for (const k of [resepsiyon, muhasebe, terapist]) {
      await reddedilmeli(withTenant(tx(k), (t) => rpc(t, "klinik_cari_odeme_ekle", { p_tedarikci_adi: "ACME", p_tutar: "1", p_tarih: "2026-10-25", p_odeme_tipi: "nakit" })), /yetkisiz/);
    }
    // borç düzenleme: başka kliniğin hareketi bulunamaz
    const borc = (await sql<{ id: string }>("select id from hasta_bakiye_hareket where klinik_id = $1 and tur = 'borc' limit 1", [F]))[0].id;
    await reddedilmeli(withTenant(tenantBaglami({ klinik: K2.klinik, kullanici: admin2 }), (t) => rpc(t, "hasta_bakiye_hareket_borc_duzenle", { p_hareket_id: borc, p_iskonto_tutari: "0", p_faturali: false, p_aciklama: null })), /hareket_bulunamadi/);
    await reddedilmeli(withTenant(tx(terapist), (t) => rpc(t, "hasta_bakiye_hareket_borc_duzenle", { p_hareket_id: borc, p_iskonto_tutari: "0", p_faturali: false, p_aciklama: null })), /yetkisiz/);
    // arşiv içe aktarma: yalnız klinik_admin
    await reddedilmeli(withTenant(tx(resepsiyon), (t) => rpc(t, "hasta_bakiye_hareket_arsiv_ekle", { p_kayitlar: "[]" })), /yetkisiz/);
    await reddedilmeli(withTenant(tx(muhasebe), (t) => rpc(t, "paket_satis_arsiv_ekle", { p_paket_id: PAKET, p_kayitlar: "[]" })), /yetkisiz/);
    // islem_tanimi_kaydet: yalnız klinik_admin; başka kliniğin cihaz/pozisyon kimliği reddedilir
    const yabanciCihaz = randomUUID();
    await yaz("insert into cihaz(id, klinik_id, ad) values ($1, $2, 'Kendi Cihaz')", [yabanciCihaz, K2.klinik]).catch(() => undefined);
    await tenantdaCalistir(K2.klinik, (c) => c.query("insert into cihaz(id, klinik_id, ad) values ($1, $2, 'K2 Cihaz') on conflict do nothing", [yabanciCihaz, K2.klinik]));
    await reddedilmeli(
      withTenant(tx(admin), (t) =>
        rpc(t, "islem_tanimi_kaydet", { p_id: null, p_ad: "Çapraz", p_vita_fiyat: "10", p_plus_fiyat: null, p_elit_fiyat: null, p_prime_fiyat: null, p_kdv_orani: "20", p_muhasebe_hizmet_ismi: null, p_adimlar: [{ id: null, ad: "A", gerekli_cihaz_id: yabanciCihaz, uygulayici_pozisyon_id: null, sure_dakika: 10 }] })
      ),
      /cihaz_bulunamadi/
    );
    expect((await sql("select 1 from islem_tanimi where klinik_id = $1 and ad = 'Çapraz'", [F])).length).toBe(0);
    await reddedilmeli(withTenant(tx(resepsiyon), (t) => rpc(t, "islem_tanimi_kaydet", { p_id: null, p_ad: "R", p_vita_fiyat: "10", p_plus_fiyat: null, p_elit_fiyat: null, p_prime_fiyat: null, p_kdv_orani: "20", p_muhasebe_hizmet_ismi: null, p_adimlar: [{ id: null, ad: "A", gerekli_cihaz_id: null, uygulayici_pozisyon_id: null, sure_dakika: 10 }] })), /yetkisiz/);
  });

  it("fiyat/paket yazımı yalnız klinik_admin; eylem düzeyinde tenant doğrulaması (başka kliniğin tedavisiyle paket yazılamaz)", async () => {
    as(resepsiyon, F, "resepsiyon");
    const adim = JSON.stringify([{ id: null, ad: "Adım A", uygulayici_pozisyon_id: "", gerekli_cihaz_id: "", sure_dakika: 10 }]);
    expect((await islemTanimiOlustur(null, fd({ ad: "Yeni", vita_fiyat: "10", kdv_orani: "20", adimlar: adim })))?.message).toBe(YETKISIZ_MESAJI);
    as(admin, F, "klinik_admin");
    expect((await islemTanimiOlustur(null, fd({ ad: "Yeni Tedavi", vita_fiyat: "10.005", kdv_orani: "20", adimlar: adim })))?.success).toBe(false); // 3 ondalık
    const yeni = await islemTanimiOlustur(null, fd({ ad: "Yeni Tedavi", vita_fiyat: "123,45", plus_fiyat: "", kdv_orani: "20", adimlar: adim }));
    expect(yeni?.success, yeni?.message).toBe(true);
    expect((await sql<{ vita_fiyat: string }>("select vita_fiyat::text from islem_tanimi where klinik_id = $1 and ad = 'Yeni Tedavi'", [F]))[0].vita_fiyat).toBe("123.45");
    const satilmis = await paketGuncelle(PAKET, null, fd({ ad: "Paket 5", islem_tanimi_id: ISLEM, seans_sayisi: "5", fiyat: "4000", kdv_orani: "20" }));
    expect(satilmis?.success, satilmis?.message).toBe(true);
    const capraz = await paketOlustur(null, fd({ ad: "Çapraz Paket", islem_tanimi_id: K2.islem, seans_sayisi: "3", fiyat: "100", kdv_orani: "20" }));
    expect(capraz?.message).toBe("Seçilen tedavi bulunamadı.");
    // satılmış paketin seans sayısı değiştirilemez (paket_satis var), fiyat değişebilir
    expect((await paketGuncelle(PAKET, null, fd({ ad: "Paket 5", islem_tanimi_id: ISLEM, seans_sayisi: "6", fiyat: "4000", kdv_orani: "20" })))?.message).toMatch(/satılmış/);
  });

  it("hasta_bakiye_hareket DEFTERİ değişmez: uygulama rolü UPDATE/DELETE edemez; odeme/odeme_kalemi/odeme_satiri/fatura yazılamaz (yalnız DEFINER RPC)", async () => {
    const c = await superBaglan();
    try {
      for (const q of [
        "update hasta_bakiye_hareket set tutar = 1",
        "delete from hasta_bakiye_hareket",
        "insert into odeme(klinik_id, hasta_id) values ('00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000000')",
        "update odeme set iskonto_tutari = 0",
        "delete from odeme_kalemi",
        "insert into odeme_satiri(odeme_id, yontem, tutar) values ('00000000-0000-4000-8000-000000000000', 'nakit', 1)",
        "update fatura set durum = 'kesildi'",
        "update paket_satis set kalan_adet = 99",
      ]) {
        await c.query("BEGIN");
        await c.query("SET LOCAL ROLE klinik_uygulama");
        await c.query("select set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [admin, F]);
        const hata = await c.query(q).then(() => "", (e: Error) => e.message);
        await c.query("ROLLBACK");
        expect(hata, q).toMatch(/permission denied/);
      }
    } finally {
      await c.end();
    }
  });

  it("DB CHECK'leri: negatif/sıfır tutar, tutarı aşan iskonto, borç dışı sıfır tutar doğrudan INSERT'te de reddedilir", async () => {
    const dene = (tur: string, tutar: string, iskonto: string) =>
      yaz("insert into hasta_bakiye_hareket(klinik_id, hasta_id, tur, tutar, iskonto_tutari) values ($1, $2, $3, $4, $5)", [F, H, tur, tutar, iskonto]);
    await reddedilmeli(dene("odeme", "-5", "0"), /check constraint/);
    await reddedilmeli(dene("odeme", "0", "0"), /check constraint/);
    await reddedilmeli(dene("iade", "0", "0"), /iade_kaynak_gecersiz|check constraint/);
    await reddedilmeli(dene("borc", "100", "150"), /check constraint/);
    await reddedilmeli(dene("borc", "100", "-1"), /check constraint/);
    await dene("borc", "0", "0"); // ücretsiz seans borcu geçerli
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("denetim izi (audit_log) — finans yazımları", () => {
  it("hasta bakiye hareketi, gider, kamusal ödeme, Kasa/Banka manuel hareketi, dengeleme, cari ödeme ve paket satışı audit_log'a düşer", async () => {
    const tablolar = await sql<{ hedef_tablo: string }>("select distinct hedef_tablo from audit_log where klinik_id = $1", [F]);
    const set = new Set(tablolar.map((t) => t.hedef_tablo));
    for (const t of ["hasta_bakiye_hareket", "klinik_harcama", "kamusal_odeme", "nakit_banka_hareketi", "kasa_dengeleme", "klinik_cari_odeme", "klinik_kredi_karti_odeme", "paket_satis"]) {
      expect(set.has(t), `audit_log'da ${t} yok`).toBe(true);
    }
  });

  it("silme de izlenir: manuel Kasa hareketi silinince 'delete' kaydı bırakır; alan değerleri v2 biçiminde", async () => {
    as(admin, F, "klinik_admin");
    const id = (await sql<{ id: string }>("select id from nakit_banka_hareketi where klinik_id = $1 and karsi_taraf_adi = 'Çift'", [F]))[0].id;
    const s = await nakitBankaHareketiSil(id);
    expect(s?.success, s?.message).toBe(true);
    const iz = await sql<{ eylem: string; detay: { surum?: number } }>("select eylem, detay from audit_log where hedef_tablo = 'nakit_banka_hareketi' and hedef_id = $1 order by created_at", [id]);
    expect(iz.map((x) => x.eylem)).toContain("delete");
    expect(iz.some((x) => x.detay?.surum === 2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
describe("performans fixture'ı yok burada — bkz. scripts/dev/finans-performans.mjs (docs/tasima-ilerleme.md)", () => {
  it("telefon üretici benzersiz (fixture sağlığı)", () => {
    expect(benzersizTelefon()).not.toBe(benzersizTelefon());
  });
});

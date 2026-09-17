export type HesapHareketTuru = "hakedis" | "prim" | "yol" | "yemek" | "mesai" | "avans" | "kesinti" | "odeme";

/** Manuel ekleme formunda gösterilecek türler — 'hakedis' SADECE dönem kapanışında otomatik yazılır, elle eklenemez. */
export type ManuelHesapHareketTuru = Exclude<HesapHareketTuru, "hakedis">;

export const HESAP_HAREKET_TUR_ETIKETLERI: Record<HesapHareketTuru, string> = {
  hakedis: "Hakediş (Taban)",
  prim: "Prim",
  yol: "Yol",
  yemek: "Yemek",
  mesai: "Fazla Mesai",
  avans: "Avans",
  kesinti: "Kesinti",
  odeme: "Ödeme",
};

/** + turler bakiyeyi artırır (personelin alacağı), − turler azaltır (borç kapatma). */
export const HESAP_HAREKET_YONU: Record<HesapHareketTuru, 1 | -1> = {
  hakedis: 1,
  prim: 1,
  yol: 1,
  yemek: 1,
  mesai: 1,
  avans: -1,
  kesinti: -1,
  odeme: -1,
};

/** Ödeme tipi seçimi sadece bu türlerde anlamlı — Kasa/Banka'nın "Giden" tarafı buradan besleniyor (bkz. supabase/migrations/20260916090000). */
export const ODEME_TIPI_GOSTERILEN_TURLER: ManuelHesapHareketTuru[] = ["odeme", "avans"];

/**
 * Manuel ödeme formundaki kategori seçimi — "Maaş" DB'de ayrı bir tür DEĞİL,
 * hakediş(maaş) elle eklenemez kuralı (bkz. personel/CLAUDE.md) hiç ihlal
 * edilmeden altta tur='odeme' olarak yazılır, sadece tutar önerisi ve
 * açıklama etiketi farklı. Personel detayındaki tekil ödeme formu ve Hesap
 * sekmesindeki tekil+toplu ödeme formu TEK bu eşlemeyi paylaşır.
 */
export type OdemeKategori = "maas" | "odeme" | "avans" | "prim" | "yol" | "yemek" | "mesai" | "kesinti";

export const ODEME_KATEGORI_ETIKET: Record<OdemeKategori, string> = {
  maas: "Maaş",
  odeme: "Diğer Ödeme",
  avans: "Avans",
  prim: "Prim",
  yol: "Yol",
  yemek: "Yemek",
  mesai: "Fazla Mesai",
  kesinti: "Kesinti",
};

export const ODEME_KATEGORI_TUR: Record<OdemeKategori, ManuelHesapHareketTuru> = {
  maas: "odeme",
  odeme: "odeme",
  avans: "avans",
  prim: "prim",
  yol: "yol",
  yemek: "yemek",
  mesai: "mesai",
  kesinti: "kesinti",
};

export type PersonelOdemeTipi = "nakit" | "havale";

export const PERSONEL_ODEME_TIPI_ETIKET: Record<PersonelOdemeTipi, string> = {
  nakit: "Nakit",
  havale: "Havale",
};

export type HesapHareket = {
  id: string;
  personel_id: string;
  tur: HesapHareketTuru;
  tutar: number;
  tarih: string;
  aciklama: string | null;
  kaynak_id: string | null;
  created_at: string;
  odeme_tipi: PersonelOdemeTipi | null;
  banka_hesap_id: string | null;
};

export type HesapBakiye = {
  personel_id: string;
  klinik_id: string;
  toplam_hakedis: number;
  toplam_odenen: number;
  bakiye: number;
};

export type TerapistPrimSatiri = {
  personelId: string;
  adSoyad: string;
  taban: number;
  prim: number;
  ekstraToplam: number;
  toplam: number;
  aciklama: string;
};

export type SabitPersonelMaliyeti = {
  toplamMaas: number;
  sabitToplam: number;
  ekstraToplam: number;
  terapistPrimleri: TerapistPrimSatiri[];
};

export type RandevuDurumOzeti = {
  tamamlanan: number;
  planlanan: number;
  ertelenen: number;
  iptalVeGelmedi: number;
  toplam: number;
};

export type GelirOzeti = {
  kdvli: number;
  kdvsiz: number;
  iskontoToplam: number;
  netTahsilat: number;
};

export type YillikAy = {
  ay: number;
  ayEtiketi: string;
  gelir: number;
  gider: number;
  seansSayisi: number;
};

export type GunlukIsTuru = "randevu" | "gelir" | "gider" | "muhasebe";

export type GunlukIsKalemi = {
  id: string;
  tur: GunlukIsTuru;
  /** Randevu/gelir kalemlerinde "HH:mm", gider/muhasebe kalemlerinde (date kolonu, saatsiz) null. */
  saat: string | null;
  baslik: string;
  altBaslik: string | null;
  tutar: number;
  /** "notr": randevu kalemi — kendi başına gelir/gider tutarı taşımaz, bilgi amaçlı listelenir. */
  yon: "gelir" | "gider" | "notr";
  durum?: string;
  /** Hastaya bağlı kalemlerde (randevu/gelir) o hastanın O GÜNE ait borç satırlarının net toplamı (hasta_bakiye_hareket, tur='borc', tutar-iskonto_tutari) — hastanın genel/güncel cari bakiyesi DEĞİL, yalnız o gün oluşan bedel. O gün borç oluşmadıysa undefined (satır hiç gösterilmez). Hastasız kalemlerde (gider/muhasebe) de yok. */
  gunlukBedel?: number;
  /**
   * Yalnız randevu kalemlerinde: bu SEANSIN bedeli nasıl kapandı — "Paketten
   * düşüldü" / "Cariye eklendi (tahsil edilmedi)" / "{Nakit|Kredi Kartı|Banka
   * Havalesi} ile tahsil edildi" (bkz. Randevu Çizelgesi'ndeki Cariye Ekle/
   * Ödeme Ekle, randevu_seans_bedelini_isle). Henüz hiç işlenmediyse null —
   * gunlukBedel'in aksine bu, o hastanın o GÜNKÜ toplamı değil, doğrudan bu
   * randevu_id'ye bağlı hasta_bakiye_hareket satırından türer.
   */
  kapanisSekli?: string | null;
};

/** Bir günün tüm iş dökümü — Raporlar > Aylık görünümdeki gün listesi için. */
export type GunlukOzet = {
  tarih: string;
  gelir: number;
  gider: number;
  seansSayisi: number;
  kalemler: GunlukIsKalemi[];
};

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
  /** Hastaya bağlı kalemlerde (randevu/gelir) o hastanın GÜNCEL toplam cari bakiyesi (v_hasta_cari_ozet.kalan_bakiye) — bu işlemin ANINDAKİ bakiyesi değil. Hastasız kalemlerde (gider/muhasebe) yok. */
  bakiye?: number;
};

/** Bir günün tüm iş dökümü — Raporlar > Aylık görünümdeki gün listesi için. */
export type GunlukOzet = {
  tarih: string;
  gelir: number;
  gider: number;
  seansSayisi: number;
  kalemler: GunlukIsKalemi[];
};

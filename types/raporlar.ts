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
  terapistPrimleri: TerapistPrimSatiri[];
};

export type GelirOzeti = {
  kdvli: number;
  kdvsiz: number;
  kdvTutari: number;
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

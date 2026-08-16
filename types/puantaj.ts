export type PuantajDurum = "calisti" | "izinli" | "raporlu" | "gelmedi" | "resmi_tatil";
export type FmOnayDurumu = "bekliyor" | "onaylandi" | "reddedildi";
export type PuantajKaynak = "manuel" | "tablet" | "self_qr" | "izin_talebi";
export type DonemDurum = "acik" | "kapali";

export const PUANTAJ_DURUM_SECENEKLERI: { value: PuantajDurum; label: string }[] = [
  { value: "calisti", label: "Çalıştı" },
  { value: "izinli", label: "İzinli" },
  { value: "raporlu", label: "Raporlu" },
  { value: "gelmedi", label: "Gelmedi" },
  { value: "resmi_tatil", label: "Resmi Tatil" },
];

export const PUANTAJ_DURUM_TONLARI: Record<PuantajDurum, "emerald" | "sky" | "amber" | "rose" | "slate"> = {
  calisti: "emerald",
  izinli: "sky",
  raporlu: "sky",
  gelmedi: "rose",
  resmi_tatil: "slate",
};

export const FM_ONAY_DURUM_TONLARI: Record<FmOnayDurumu, "emerald" | "amber" | "rose"> = {
  bekliyor: "amber",
  onaylandi: "emerald",
  reddedildi: "rose",
};

export const FM_ONAY_DURUM_ETIKETLERI: Record<FmOnayDurumu, string> = {
  bekliyor: "Bekliyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

/** personel_puantaj tablosundaki ham satır (DB'den birebir). */
export type PersonelPuantajSatir = {
  id: string;
  tarih: string;
  planlanan_baslangic: string | null;
  planlanan_bitis: string | null;
  giris_saat: string | null;
  cikis_saat: string | null;
  mola_dakika: number;
  net_calisma_dakika: number | null;
  sapma_dakika: number | null;
  fazla_mesai_dakika: number | null;
  eksik_calisma_dakika: number | null;
  fm_onay_durumu: FmOnayDurumu;
  durum: PuantajDurum;
  kaynak: PuantajKaynak;
  not_metni: string | null;
};

/** Aylık tabloda gösterilen bir gün — DB'de satır olsun olmasın (yoksa "sanal" olarak dolduruluyor). */
export type PuantajGunSatiri = {
  tarih: string;
  kayit: PersonelPuantajSatir | null;
  /** kayit yoksa personel_vardiya_atama'dan hesaplanan planlanan saat. */
  sanalPlanlanan: { baslangic: string; bitis: string } | null;
};

export type PersonelPuantajDonem = {
  id: string;
  yil: number;
  ay: number;
  durum: DonemDurum;
  snapshot_net_saat: number | null;
  snapshot_onayli_fm_saat: number | null;
  snapshot_eksik_saat: number | null;
  snapshot_izin_gun: number | null;
  snapshot_devamsizlik_gun: number | null;
  kapatan_id: string | null;
  kapatma_tarihi: string | null;
};

export type VardiyaTuru = {
  id: string;
  ad: string;
  baslangic_saat: string;
  bitis_saat: string;
  aktif: boolean;
};

export type PersonelVardiyaAtamaSatir = {
  id: string;
  haftanin_gunu: number;
  gecerlilik_baslangic: string;
  gecerlilik_bitis: string | null;
  vardiya_turu: VardiyaTuru;
};

/** Yıllık görünümdeki bir ay satırı — kapalıysa snapshot'tan, açıksa canlı toplamdan. */
export type YillikAySatiri = {
  ay: number;
  netSaat: number;
  onayliFmSaat: number;
  eksikSaat: number;
  izinGun: number;
  devamsizlikGun: number;
  donemDurum: DonemDurum;
};

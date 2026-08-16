export type IzinTip = "yillik" | "mazeret" | "ucretsiz" | "idari" | "telafi";
export type IzinDurum = "beklemede" | "onaylandi" | "reddedildi" | "iptal";

export const IZIN_TIP_ETIKETLERI: Record<IzinTip, string> = {
  yillik: "Yıllık İzin",
  mazeret: "Mazeret İzni",
  ucretsiz: "Ücretsiz İzin",
  idari: "İdari İzin",
  telafi: "Telafi İzni",
};

export const IZIN_TIP_SECENEKLERI: { value: IzinTip; label: string }[] = [
  { value: "yillik", label: IZIN_TIP_ETIKETLERI.yillik },
  { value: "mazeret", label: IZIN_TIP_ETIKETLERI.mazeret },
  { value: "ucretsiz", label: IZIN_TIP_ETIKETLERI.ucretsiz },
  { value: "idari", label: IZIN_TIP_ETIKETLERI.idari },
  { value: "telafi", label: IZIN_TIP_ETIKETLERI.telafi },
];

export const IZIN_DURUM_ETIKETLERI: Record<IzinDurum, string> = {
  beklemede: "Beklemede",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
  iptal: "İptal",
};

export const IZIN_DURUM_TONLARI: Record<IzinDurum, "amber" | "emerald" | "rose" | "slate"> = {
  beklemede: "amber",
  onaylandi: "emerald",
  reddedildi: "rose",
  iptal: "slate",
};

export type IzinTalebi = {
  id: string;
  personel_id: string;
  tip: IzinTip;
  baslangic_tarih: string;
  bitis_tarih: string;
  gun_sayisi: number;
  gerekce: string | null;
  belge_url: string | null;
  durum: IzinDurum;
  red_gerekce: string | null;
  degerlendiren_kullanici_id: string | null;
  degerlendirme_tarihi: string | null;
  iptal_eden_kullanici_id: string | null;
  iptal_tarihi: string | null;
  created_at: string;
};

/** Admin onay ekranında personel adı/telefonu ile birlikte gösterilen genişletilmiş satır. */
export type IzinTalebiAdminSatir = IzinTalebi & {
  personel: { ad_soyad: string; gorev: string } | null;
};

export type IzinBakiye = {
  personel_id: string;
  hak_gun: number;
  devir_gun: number;
  duzeltme_gun: number;
  onaylanan_gun: number;
  beklemede_gun: number;
  kalan_gun: number;
};

export type IzinCakisan = {
  personel_id: string;
  ad_soyad: string;
  baslangic_tarih: string;
  bitis_tarih: string;
};

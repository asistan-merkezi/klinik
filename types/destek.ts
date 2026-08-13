export type DestekTuru = "talep" | "sikayet";
export type DestekDurum = "yeni" | "inceleniyor" | "cozuldu";

export type DestekTalebi = {
  id: string;
  klinik_id: string;
  kullanici_id: string;
  tur: DestekTuru;
  konu: string;
  aciklama: string;
  durum: DestekDurum;
  created_at: string;
  guncellenme_tarihi: string | null;
  kullanici: { ad_soyad: string } | null;
};

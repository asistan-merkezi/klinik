export type MesajBolum = "hasta" | "randevu" | "personel" | "muhasebe";
export type MesajKanal = "sms" | "whatsapp" | "mail";
export type MesajKrediIslemTipi = "yukleme" | "kullanim" | "iade";

export const BOLUM_ETIKET: Record<MesajBolum, string> = {
  hasta: "Hasta",
  randevu: "Randevu",
  personel: "Personel",
  muhasebe: "Muhasebe",
};

export const BOLUM_SIRASI: MesajBolum[] = ["hasta", "randevu", "personel", "muhasebe"];

export const KANAL_ETIKET: Record<MesajKanal, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  mail: "Mail",
};

export const KANAL_SIRASI: MesajKanal[] = ["sms", "whatsapp", "mail"];

export const KREDI_ISLEM_ETIKET: Record<MesajKrediIslemTipi, string> = {
  yukleme: "Yükleme",
  kullanim: "Kullanım",
  iade: "İade",
};

export type MesajKuralSatir = {
  id: string;
  bolum: MesajBolum;
  tetikleyici_kod: string;
  tetikleyici_adi: string;
  mesaj_metni: string;
  sms_aktif: boolean;
  whatsapp_aktif: boolean;
  mail_aktif: boolean;
  aktif: boolean;
};

export type MesajKrediBakiyeSatir = {
  kanal: MesajKanal;
  bakiye: number;
  updated_at: string;
};

export type MesajKrediIslemSatir = {
  id: string;
  kanal: MesajKanal;
  islem_tipi: MesajKrediIslemTipi;
  miktar: number;
  tutar: number | null;
  aciklama: string | null;
  created_at: string;
};

/** mesaj_log'un tarih+bölüm bazında GROUP BY ile toplanmış ekran görünümü. */
export type MesajKullanimOzetSatir = {
  tarih: string;
  bolum: MesajBolum;
  toplam_adet: number;
};

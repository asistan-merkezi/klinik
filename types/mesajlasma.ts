export type MesajBolum = "hasta" | "randevu" | "personel" | "muhasebe";
export type MesajKanal = "sms" | "whatsapp" | "mail";
export type MesajKrediHareketTipi = "yukleme" | "dusum" | "iade";
export type MesajKuyrukDurum = "beklemede" | "gonderiliyor" | "gonderildi" | "hata" | "iptal";
export type MesajAliciTipi = "hasta" | "personel";

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

export const KREDI_HAREKET_ETIKET: Record<MesajKrediHareketTipi, string> = {
  yukleme: "Yükleme",
  dusum: "Düşüm",
  iade: "İade",
};

/**
 * mesaj_kurallari'de bu tetikleyici için DB satırı OLMAYABİLİR (yeni klinik
 * veya hiç dokunulmamış tetikleyici — "kayıt yoksa pasif" kuralı). Bu tip
 * `lib/mesaj/kural-cozumle.ts`'in kod kataloğu + (varsa) DB satırını
 * birleştirdiği EKRANDA GÖSTERİLECEK sonucu temsil eder — DB'nin ham
 * satır şekli değil.
 */
export type EtkinMesajKurali = {
  /** DB'de gerçek bir satır varsa mesaj_kurallari.id, yoksa null (henüz hiç kaydedilmedi). */
  id: string | null;
  bolum: MesajBolum;
  tetikleyici_kodu: string;
  tetikleyici_adi: string;
  mesaj_metni: string;
  sms_aktif: boolean;
  whatsapp_aktif: boolean;
  mail_aktif: boolean;
  aktif: boolean;
};

export type MesajKredi = {
  kanal: MesajKanal;
  bakiye: number;
  updated_at: string;
};

export type MesajKrediHareketi = {
  id: string;
  kanal: MesajKanal;
  tip: MesajKrediHareketTipi;
  miktar: number;
  tutar: number | null;
  aciklama: string | null;
  created_at: string;
};

/** mesaj_kuyrugu'nun tarih+bölüm bazında GROUP BY ile toplanmış ekran görünümü (durum='gonderildi', test_mi=false). */
export type MesajKullanimOzetSatir = {
  tarih: string;
  bolum: MesajBolum;
  toplam_adet: number;
};

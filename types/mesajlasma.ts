export type MesajBolum = "hasta" | "randevu" | "personel" | "muhasebe";
export type MesajKanal = "sms" | "whatsapp" | "mail";
// Merkez kredi modeline geçişten (2026-08-17) sonra mesaj_kredi_hareketleri
// SADECE 'yukleme' kabul ediyor (DB CHECK kısıtı) — düşüm/iade artık
// tamamen merkezin kendi defterinde, yerelde hiç yazılmıyor.
export type MesajKrediHareketTipi = "yukleme";
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
  son_senkron_zamani: string | null;
  merkez_bakiye_versiyonu: number;
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

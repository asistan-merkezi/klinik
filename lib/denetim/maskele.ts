// Denetim Geçmişi'nde hassas alan / değer MASKELEME. İki katman:
//  1) ALAN ADI: maaş, T.C. kimlik, pasaport, IBAN, sağlık/anamnez metinleri, parola/jeton... → değer HİÇ gösterilmez.
//  2) DEĞER DESENİ: serbest metinde T.C. kimlik (11 hane), IBAN, kart no görünüyorsa maskelenir (alan adı masum görünse bile).
// Aynı alan listesi veritabanında YAZARKEN de uygulanır (audit_detay_temizle, 0015_destek_baglami.sql) — bu dosya mevcut/eski kayıtlar ve savunma derinliği içindir.
// İKİ LİSTE BİRLİKTE DEĞİŞİR (SQL regex ↔ ALAN_DESENI).
export const GIZLI_METIN = "••• gizli";

const ALAN_DESENI =
  /(tc_?kimlik|pasaport|iban|maas|ucret|fm_saatlik|sifre|parola|token|secret|anamnez|saglik|ozgecmis|sikayet|agri_oykusu|degerlendirme_notu|ilac|cevaplar|hasta_notu|notlar|oneri_metni|(^|_)gerekce$|kart_no|cvv|storage_path)/i;

export function alanHassasMi(alan: string): boolean {
  return ALAN_DESENI.test(alan);
}

const DESENLER: [RegExp, string][] = [
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/gi, "[IBAN gizli]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[kart gizli]"],
  [/\b[1-9]\d{10}\b/g, "[T.C. gizli]"],
];

export function desenleriMaskele(metin: string): string {
  return DESENLER.reduce((m, [kalip, yerine]) => m.replace(kalip, yerine), metin);
}

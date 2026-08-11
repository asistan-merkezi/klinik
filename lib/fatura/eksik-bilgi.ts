// Faturalı işaretlemeden önce hem client (uyarı göstermek için) hem server
// (hasta_bakiye_hareket_borc_duzenle RPC'sinin "fatura_bilgisi_eksik" hata
// kodunu çevirmek için) aynı alan listesini paylaşsın diye tek yerde tutulur.
export const FATURA_ALAN_ETIKETLERI: Record<string, string> = {
  ad_soyad: "Ad Soyad",
  eposta: "E-posta",
  adres: "Adres",
  kimlik_no: "TC Kimlik/Pasaport No",
};

export type FaturaBilgisiKontrol = {
  adSoyad: string | null;
  eposta: string | null;
  adres: string | null;
  kimlikNo: string | null;
};

export function faturaEksikAlanlariBul(bilgi: FaturaBilgisiKontrol): string[] {
  const eksikler: string[] = [];
  if (!bilgi.adSoyad) eksikler.push("ad_soyad");
  if (!bilgi.eposta) eksikler.push("eposta");
  if (!bilgi.adres) eksikler.push("adres");
  if (!bilgi.kimlikNo) eksikler.push("kimlik_no");
  return eksikler;
}

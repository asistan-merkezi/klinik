/**
 * Pakette kalan seans hakkı bu değere VEYA altına (ama 0'ın üstüne) düştüğünde
 * "paketiniz bitmek üzere" uyarısı verilir — hem resepsiyon ekranında (randevu
 * detay paneli + toast) hem hastaya giden mesajda (`hasta_paket_seans_azaldi`).
 * Eşik tek yerde: ürün kararı "son 1 veya 2 seans" (2026-09-30).
 *
 * 0'da uyarı YOK: paket zaten bitmiş, hasta "yenile" mesajından çok yeni satış
 * konuşmasına ihtiyaç duyar — bu ayrı bir akış.
 */
export const PAKET_YENILEME_ESIGI = 2;

export function paketYenilemeGerekliMi(kalanAdet: number | null | undefined): kalanAdet is number {
  return typeof kalanAdet === "number" && kalanAdet > 0 && kalanAdet <= PAKET_YENILEME_ESIGI;
}

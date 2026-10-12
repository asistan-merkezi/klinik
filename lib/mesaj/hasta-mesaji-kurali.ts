/** Hasta mesajlarının SAF kuralları (birim testli). Kuyruğa yazma `hasta-mesaji.ts`'te. */

/** "₺1.250,50" — mesaj şablonundaki {{tutar}}. */
export function tutarMetni(tutar: number): string {
  return tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
}

/** Hoş geldin: hasta başına tek (kayıt silinip aynı id ile yeniden oluşmaz, ama olsa da bir kez). */
export function hosgeldinAnahtari(hastaId: string): string {
  return `hasta_kayit_hosgeldin:${hastaId}`;
}

/** Paket satış özeti: satış (paket_satis satırı) başına tek. */
export function paketSatisOzetiAnahtari(paketSatisId: string): string {
  return `hasta_paket_satis_ozet:${paketSatisId}`;
}

/** Satış satırı bu kadar yeniden oluşmuşsa "şimdi satılan" sayılır (eski satışa yanlışlıkla mesaj gitmesin). */
export const PAKET_SATIS_TAZELIK_MS = 2 * 60_000;

export function paketSatisTazeMi(olusturuldu: string, simdi: Date = new Date()): boolean {
  const fark = simdi.getTime() - new Date(olusturuldu).getTime();
  return fark >= -PAKET_SATIS_TAZELIK_MS && fark <= PAKET_SATIS_TAZELIK_MS;
}

/**
 * Ödeme alındı: ödeme satırı başına tek. `hareketId` yoksa (randevu seans ödemesi RPC'si satır id'si dönmez)
 * randevu başına tek — o RPC zaten işlenmiş seansta ikinci ödemeyi yazmaz.
 */
export function odemeAlindiAnahtari(kaynak: { hareketId: string } | { randevuId: string }): string {
  return "hareketId" in kaynak
    ? `muhasebe_odeme_alindi:hareket:${kaynak.hareketId}`
    : `muhasebe_odeme_alindi:randevu:${kaynak.randevuId}`;
}

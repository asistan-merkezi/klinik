/**
 * Tedarikçi eşleme anahtarı: "Ofis  Market" / "ofis market" / "OFİS MARKET" aynı tedarikçi sayılır
 * (Türkçe küçük harf, tek boşluk). SQL tarafındaki `tedarikci_anahtari()` (migration 20261012100000)
 * AYNI kuralı uygular — biri değişirse diğeri de değişmeli.
 */
export function tedarikciAnahtari(ad: string): string {
  return ad.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

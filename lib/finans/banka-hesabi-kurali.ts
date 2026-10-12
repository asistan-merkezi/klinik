/**
 * Havale ile yapılan her ödeme/tahsilat bir banka hesabına bağlı olmalı — Banka defteri hesap
 * bazlı çalışır, hesapsız havale satırı hiçbir hesapta görünmez ve mutabakat sessizce tutmaz.
 * DB tarafında `banka_hesabi_butunluk` tetikleyicisi (migration 20261012120000) aynı kuralı zorlar;
 * bu yardımcılar kullanıcıya anlaşılır mesaj vermek için.
 */
export const HAVALE_HESAP_GEREKLI_MESAJI = "Havale için banka hesabı seçilmeli.";

export function havaleHesapEksikMi(odemeYontemi: string | null | undefined, bankaHesapId: string | null | undefined) {
  return (odemeYontemi === "havale" || odemeYontemi === "banka_havalesi") && !bankaHesapId;
}

/** Tetikleyiciden dönen hatayı çevirir; tanınmazsa null. */
export function bankaHesabiHatasiniCevir(mesaj: string | undefined): string | null {
  if (!mesaj) return null;
  if (mesaj.includes("banka_hesabi_gerekli")) return HAVALE_HESAP_GEREKLI_MESAJI;
  if (mesaj.includes("banka_hesabi_gecersiz")) return "Seçilen banka hesabı bulunamadı.";
  return null;
}

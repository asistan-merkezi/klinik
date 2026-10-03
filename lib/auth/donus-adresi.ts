/**
 * Giriş sonrası geri dönüş adresi (`/giris?donus=...`). Açık yönlendirme
 * (open redirect) olmasın diye serbest bir yol KABUL EDİLMEZ — yalnız kapı
 * QR'larının puantaj adresleri geçer; geri kalan her şey null döner ve
 * çağıran `/panel`'e düşer.
 */
const IZINLI_DONUS = /^\/puantaj\/[A-Za-z0-9_-]+\/(giris|cikis)$/;

export function guvenliDonusAdresi(deger: unknown): string | null {
  return typeof deger === "string" && IZINLI_DONUS.test(deger) ? deger : null;
}

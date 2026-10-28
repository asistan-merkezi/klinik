// Oturumlu uçlar için kullanıcı başına hız sınırı (DB tabanlı, sunucu içi, FAIL-CLOSED: sayaç yazılamazsa istek reddedilir).
// Giriş / şifre / QR / anonim uçlar kendi anahtarlarını lib/guvenlik/hiz-siniri.ts ile doğrudan kullanır; bu dosya route ve server action'lar içindir.
import { HizSiniriHatasi, hizAnahtari, hizSiniriKaydet } from "./hiz-siniri";

/** Bütün sınırlar tek yerde (docs/guvenlik-baseline.md). limit: pencere içindeki en çok istek. */
export const SINIRLAR = {
  pdf: { limit: 30, pencereSn: 600 },
  dosyaYukle: { limit: 60, pencereSn: 600 },
  dosyaGoruntule: { limit: 600, pencereSn: 600 },
  hastaArama: { limit: 240, pencereSn: 60 },
  destekBaglami: { limit: 10, pencereSn: 3600 },
  chatbot: { limit: 60, pencereSn: 600 },
} as const;
export type SinirAdi = keyof typeof SINIRLAR;

export type SinirSonucu = { izin: true } | { izin: false; durum: 429 | 503; mesaj: string };

export async function sinirKontrol(ad: SinirAdi, kimlik: string): Promise<SinirSonucu> {
  const s = SINIRLAR[ad];
  try {
    await hizSiniriKaydet([{ anahtar: hizAnahtari(`ist:${ad}`, kimlik), limit: s.limit, pencereSn: s.pencereSn }]);
    return { izin: true };
  } catch (e) {
    if (e instanceof HizSiniriHatasi && e.neden === "asildi") return { izin: false, durum: 429, mesaj: "Çok fazla istek. Lütfen biraz bekleyip tekrar deneyin." };
    return { izin: false, durum: 503, mesaj: "İşlem şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin." };
  }
}

/** Route'lar için: sınır aşıldıysa hazır Response (429/503 + Retry-After), değilse null. */
export async function sinirYaniti(ad: SinirAdi, kimlik: string): Promise<Response | null> {
  const r = await sinirKontrol(ad, kimlik);
  if (r.izin) return null;
  return Response.json({ error: r.mesaj }, { status: r.durum, headers: { "Cache-Control": "no-store", "Retry-After": String(r.durum === 429 ? SINIRLAR[ad].pencereSn : 10) } });
}

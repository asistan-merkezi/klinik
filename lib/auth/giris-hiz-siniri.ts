import { createHash } from "node:crypto";
import { hizSiniriAsildiMi, hizSiniriKaydet, ipAnahtari, type HizSiniriKurali } from "@/lib/qr/hiz-siniri";

/**
 * Personel ve hasta portalı girişinde kaba kuvvet koruması. Portal geçici şifreleri kısa olduğundan
 * özellikle önemli. Yalnız BAŞARISIZ denemeler sayılır:
 *  - hesap (telefon/e-posta) başına 15 dakikada 5 hatalı deneme,
 *  - IP başına 15 dakikada 30 hatalı deneme (klinik NAT'ı paylaşılabilir, gevşek).
 * Sınır dolunca doğru şifre de 15 dakika reddedilir. Hesap kimliği düz saklanmaz (hash).
 * Altyapı hiz_siniri_kullan RPC'si — FAIL-OPEN (bkz. lib/qr/hiz-siniri.ts).
 *
 * Not: Supabase Auth'un kendi IP bazlı oran sınırı ayrıca geçerlidir; bu katman sunucu eylemi
 * yolunu hesap bazında korur.
 */
const PENCERE_SN = 15 * 60;

function hesapAnahtari(onEk: string, kimlik: string): string {
  const normal = kimlik.includes("@") ? kimlik.trim().toLowerCase() : kimlik.replace(/\D/g, "").replace(/^(90|0)/, "");
  return `${onEk}:hesap:${createHash("sha256").update(normal).digest("hex").slice(0, 24)}`;
}

async function kurallar(onEk: string, kimlik: string): Promise<HizSiniriKurali[]> {
  return [
    { anahtar: hesapAnahtari(onEk, kimlik), limit: 5, pencereSn: PENCERE_SN },
    { anahtar: await ipAnahtari(`${onEk}_hata`), limit: 30, pencereSn: PENCERE_SN },
  ];
}

export const GIRIS_KILITLI_MESAJI = "Çok fazla hatalı deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.";

/** Giriş denemesinden ÖNCE: sınır dolmuşsa true (deneme yapılmamalı). Sayaç artırmaz. */
export async function girisKilitliMi(onEk: "personel_giris" | "portal_giris", kimlik: string): Promise<boolean> {
  return hizSiniriAsildiMi(await kurallar(onEk, kimlik));
}

/** Hatalı denemeden SONRA çağrılır. */
export async function hataliGirisKaydet(onEk: "personel_giris" | "portal_giris", kimlik: string): Promise<void> {
  await hizSiniriKaydet(await kurallar(onEk, kimlik));
}

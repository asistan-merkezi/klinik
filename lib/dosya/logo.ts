// Klinik logosu: DOSYA_KOKU/klinik-logo/<klinik_id>/logo.<uzanti>. Yalnız yetkili route'lardan servis edilir (public dosya YOK).
import { dosyaOku, dosyaSil, dosyaYaz } from "./depo";

export const IZINLI_LOGO_TIPLERI: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const UZANTI_TIP: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };
export const LOGO_MAKS_BAYT = 2 * 1024 * 1024;

export async function logoKaydet(klinikId: string, tip: string, veri: Buffer): Promise<void> {
  const uzanti = IZINLI_LOGO_TIPLERI[tip];
  if (!uzanti) throw new Error("logo_tipi_gecersiz");
  await dosyaYaz("klinik-logo", [klinikId, `logo.${uzanti}`], veri);
  // Eski sürümler (başka uzantı) silinir: route yalnız tek dosya bulur.
  for (const u of Object.values(IZINLI_LOGO_TIPLERI)) if (u !== uzanti) await dosyaSil("klinik-logo", [klinikId, `logo.${u}`]);
}

export async function logoBul(klinikId: string): Promise<{ veri: Buffer; tip: string } | null> {
  for (const [uzanti, tip] of Object.entries(UZANTI_TIP)) {
    const veri = await dosyaOku("klinik-logo", [klinikId, `logo.${uzanti}`]);
    if (veri) return { veri, tip };
  }
  return null;
}

/** Güvenli yanıt başlıkları: SVG içindeki betikler hiçbir bağlamda çalışmasın. */
export function logoYaniti(logo: { veri: Buffer; tip: string }, onbellek: string): Response {
  return new Response(new Uint8Array(logo.veri), {
    headers: {
      "Content-Type": logo.tip,
      "Cache-Control": onbellek,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

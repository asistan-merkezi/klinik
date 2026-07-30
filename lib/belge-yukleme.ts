"use client";

import imageCompression from "browser-image-compression";
import { MAX_DOSYA_BOYUTU_BYTE } from "@/types/hasta-belge";

const HEIC_UZANTI_REGEX = /\.(heic|heif)$/i;

function heicMi(dosya: File): boolean {
  return dosya.type === "image/heic" || dosya.type === "image/heif" || HEIC_UZANTI_REGEX.test(dosya.name);
}

export function dosyaBoyutuGecerliMi(dosya: File): boolean {
  return dosya.size <= MAX_DOSYA_BOYUTU_BYTE;
}

/**
 * Yükleme öncesi client-side hazırlık: HEIC -> JPEG dönüşümü, ardından
 * (PDF hariç) max 2000px kenar + ~1.5MB hedefiyle sıkıştırma. Canvas
 * üzerinden yeniden kodlama EXIF'i (konum verisi dahil) doğal olarak siler.
 */
export async function gorseliHazirla(
  dosya: File,
  onIlerleme?: (yuzde: number) => void
): Promise<File> {
  let calisilanDosya: File = dosya;

  if (heicMi(dosya)) {
    const heic2any = (await import("heic2any")).default;
    const sonuc = await heic2any({ blob: dosya, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(sonuc) ? sonuc[0] : sonuc;
    calisilanDosya = new File([blob], dosya.name.replace(HEIC_UZANTI_REGEX, ".jpg"), {
      type: "image/jpeg",
    });
  }

  if (calisilanDosya.type === "application/pdf") {
    return calisilanDosya;
  }

  const sikistirilmis = await imageCompression(calisilanDosya, {
    maxSizeMB: 1.5,
    maxWidthOrHeight: 2000,
    useWebWorker: true,
    onProgress: onIlerleme,
  });

  return new File([sikistirilmis], calisilanDosya.name, {
    type: sikistirilmis.type || calisilanDosya.type,
  });
}

export function dosyaUzantisiCikar(dosya: File): string {
  const isimden = dosya.name.split(".").pop()?.toLowerCase();
  if (isimden && isimden.length <= 5) return isimden;
  if (dosya.type === "application/pdf") return "pdf";
  if (dosya.type === "image/png") return "png";
  if (dosya.type === "image/webp") return "webp";
  return "jpg";
}

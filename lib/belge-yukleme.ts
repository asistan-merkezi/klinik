"use client";

import { MAX_DOSYA_BOYUTU_BYTE } from "@/types/hasta-belge";

const HEIC_UZANTI_REGEX = /\.(heic|heif)$/i;
const MAX_KENAR_PX = 1280;
const WEBP_KALITE = 0.85;

function heicMi(dosya: File): boolean {
  return dosya.type === "image/heic" || dosya.type === "image/heif" || HEIC_UZANTI_REGEX.test(dosya.name);
}

export function dosyaBoyutuGecerliMi(dosya: File): boolean {
  return dosya.size <= MAX_DOSYA_BOYUTU_BYTE;
}

/**
 * Yükleme öncesi client-side hazırlık: HEIC -> JPEG dönüşümü (canvas HEIC'i
 * doğrudan çözemediği için), ardından (PDF hariç) tüm formatlar doğrudan
 * Canvas API üzerinden max 1280px kenar + WebP (%85 kalite) olarak yeniden
 * kodlanır. Daha önce kullanılan browser-image-compression (web worker +
 * ek kopyalar) yerine createImageBitmap/canvas ile daha az bellek tüketen
 * bir yol izleniyor. Canvas üzerinden yeniden kodlama EXIF'i (konum verisi
 * dahil) doğal olarak siler.
 */
export async function gorseliHazirla(dosya: File): Promise<File> {
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

  const bitmap = await createImageBitmap(calisilanDosya);
  const olcek = Math.min(1, MAX_KENAR_PX / Math.max(bitmap.width, bitmap.height));
  const genislik = Math.round(bitmap.width * olcek);
  const yukseklik = Math.round(bitmap.height * olcek);

  const canvas = document.createElement("canvas");
  canvas.width = genislik;
  canvas.height = yukseklik;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return calisilanDosya;
  }
  ctx.drawImage(bitmap, 0, 0, genislik, yukseklik);
  bitmap.close();

  const webpBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_KALITE));
  if (!webpBlob) {
    return calisilanDosya;
  }

  const yeniAd = calisilanDosya.name.replace(/\.[^./]+$/, ".webp");
  return new File([webpBlob], yeniAd, { type: "image/webp" });
}

"use client";

/**
 * İndirilen görsele sağ alt köşede "Klinik adı · tarih" watermark'ı basar.
 * Ekranda gösterilmez, sadece indirme anında (canvas ile) uygulanır. PDF
 * indirmelerinde uygulanmaz (piksel bazlı damgalama için PDF içeriğini
 * yeniden yazmak gerekir — bu turun kapsamı dışında).
 */
export async function watermarkliGorselOlustur(
  imageUrl: string,
  klinikAdi: string,
  tarih: string
): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas bağlamı oluşturulamadı.");

  ctx.drawImage(img, 0, 0);

  const metin = klinikAdi ? `${klinikAdi} · ${tarih}` : tarih;
  const fontBoyutu = Math.max(14, Math.round(canvas.width * 0.018));
  ctx.font = `600 ${fontBoyutu}px sans-serif`;
  const metrikler = ctx.measureText(metin);
  const paddingX = fontBoyutu * 0.6;
  const paddingY = fontBoyutu * 0.5;
  const kutuGenislik = metrikler.width + paddingX * 2;
  const kutuYukseklik = fontBoyutu + paddingY * 2;
  const x = canvas.width - kutuGenislik - 12;
  const y = canvas.height - kutuYukseklik - 12;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x, y, kutuGenislik, kutuYukseklik);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(metin, x + paddingX, y + kutuYukseklik / 2);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Görsel oluşturulamadı."))),
      "image/jpeg",
      0.92
    );
  });
}

export function blobIndir(blob: Blob, dosyaAdi: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dosyaAdi;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

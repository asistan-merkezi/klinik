// Dosya İÇERİK doğrulaması: istemcinin bildirdiği MIME'a/uzantıya güvenilmez; baytların imzası (magic number) bildirilen türle eşleşmeli.
// Belge yüklemede (JPEG/PNG/WebP/PDF) ve logo yüklemede aynı mantık kullanılır.

export function icerikTipiDogrula(mime: string, veri: Uint8Array): boolean {
  const b = Buffer.from(veri.subarray(0, 16));
  switch (mime) {
    case "image/png":
      return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/jpeg":
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/webp":
      return b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
    case "application/pdf":
      return b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";
    default:
      return false;
  }
}

/** Belge yüklemede izin verilen türler ve uzantıları (uzantı dosya adından değil TÜRDEN türetilir). */
export const BELGE_UZANTILARI: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

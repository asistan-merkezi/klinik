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

/**
 * SVG logo güvenlik denetimi (kara liste + dış başvuru yasağı). Dosya ayrıca `Content-Security-Policy: sandbox; default-src 'none'` ile servis edilir
 * (betik çalışamaz); bu denetim ikinci katmandır: betik/olay işleyicisi, gömülü içerik, XXE varlık tanımı ve '#' dışı her href reddedilir.
 */
export function svgGuvenliMi(veri: Uint8Array): boolean {
  const metin = Buffer.from(veri).toString("utf8").toLowerCase();
  if (!metin.includes("<svg")) return false;
  if (/<\s*(script|foreignobject|iframe|embed|object|audio|video|animate|set|handler|listener)\b/.test(metin)) return false;
  if (/\bon[a-z]+\s*=/.test(metin)) return false;
  if (/javascript:|vbscript:|data:text\/html|<!entity|<!doctype[^>]*\[/.test(metin)) return false;
  for (const m of metin.matchAll(/(?:xlink:)?href\s*=\s*["']?\s*([^"'\s>]*)/g)) if (!m[1].startsWith("#")) return false;
  return true;
}

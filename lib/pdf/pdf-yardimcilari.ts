import { INTER_LATIN_BASE64, INTER_LATIN_EXT_BASE64 } from "@/lib/pdf/fonts/inter-base64";
import { logoBul } from "@/lib/dosya/logo";

/**
 * Klinik logosu DOSYA_KOKU'dan (lib/dosya/logo.ts) okunur ve data URI'ye çevrilir — AĞ İSTEĞİ YOK (eski sürüm `fetch(url)` yapıyordu: SSRF yüzeyi).
 * Logo yoksa belge görselsiz üretilir.
 */
export async function klinikLogosuDataUri(klinikId: string): Promise<string | null> {
  try {
    const logo = await logoBul(klinikId);
    return logo ? `data:${logo.tip};base64,${logo.veri.toString("base64")}` : null;
  } catch {
    return null;
  }
}

/**
 * Elle doldurulacak (Hasta Kayıt Formu, İş Başvuru Formu vb.) PDF şablonları
 * için ortak doctype/font/print-CSS sarmalayıcısı — Inter fontu (Türkçe
 * karakterler dahil) base64 gömülü: sunucudaki sistem fontlarına bağımlı değil
 * (Windows Server'da Türkçe karakterli font eksikliği riskini bertaraf eder). Sadece Regular (400) gömülü, kalın metinler
 * Chromium'un sentetik kalınlaştırmasına bırakılıyor.
 */
export function pdfBelgesiOlustur(icerikHtml: string): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'" />
<style>
  @font-face {
    font-family: 'Inter';
    font-style: normal;
    font-weight: 400;
    font-display: block;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215;
    src: url(data:font/woff2;base64,${INTER_LATIN_BASE64}) format('woff2');
  }
  @font-face {
    font-family: 'Inter';
    font-style: normal;
    font-weight: 400;
    font-display: block;
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
    src: url(data:font/woff2;base64,${INTER_LATIN_EXT_BASE64}) format('woff2');
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Segoe UI', sans-serif; color: #000; background: #fff; }
  @media print {
    .sayfa { break-after: page; }
    .sayfa:last-child { break-after: auto; }
    .bolum { break-inside: avoid; }
  }
</style>
</head>
<body>${icerikHtml}</body>
</html>`;
}

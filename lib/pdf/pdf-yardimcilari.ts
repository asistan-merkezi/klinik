import { INTER_LATIN_BASE64, INTER_LATIN_EXT_BASE64 } from "@/lib/pdf/fonts/inter-base64";

/**
 * Klinik logosu gibi Supabase Storage'daki public URL'leri base64 data
 * URI'ye çevirir — page.setContent() ile render edilen belgede göreli/harici
 * URL'ler yüklenmez, görsel data URI olarak gömülü olmalı.
 */
export async function gorseliDataUriyeCevir(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const yanit = await fetch(url);
    if (!yanit.ok) return null;
    const mime = yanit.headers.get("content-type") ?? "image/png";
    const buffer = Buffer.from(await yanit.arrayBuffer());
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    // Görsel indirilemezse form görselsiz üretilir — PDF'in tamamının
    // başarısız olmasına gerek yok.
    return null;
  }
}

/**
 * Elle doldurulacak (Hasta Kayıt Formu, İş Başvuru Formu vb.) PDF şablonları
 * için ortak doctype/font/print-CSS sarmalayıcısı — Inter fontu (Türkçe
 * karakterler dahil) base64 gömülü, @sparticuz/chromium'un Lambda ortamında
 * sistem fontu bulamama riskini bertaraf ediyor (bkz. Kayıt Formu PDF
 * geçmişindeki font notu). Sadece Regular (400) gömülü, kalın metinler
 * Chromium'un sentetik kalınlaştırmasına bırakılıyor.
 */
export function pdfBelgesiOlustur(icerikHtml: string): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
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

import { TETIKLEYICILER, type TetikleyiciTanimi } from "./tetikleyiciler";

/** Elle gönderimde bağlamsız doldurulabilen tek değişkenler (tutar/randevu tarihi vb. bağlam ister). */
const MANUEL_DEGISKENLER = ["hasta_adi", "klinik_adi"];

/**
 * Resepsiyon/yönetici hasta detayından elle gönderebilir: hastaya dönük (bölüm personel DEĞİL) ve yalnız
 * hasta adı/klinik adıyla dolan şablonlar. Tutar/randevu tarihi/paket adı isteyenler bağlam gerektirdiği için
 * (yanlış değerle gitmesin diye) listede yok — onlar ilgili olayda otomatik gider.
 */
export function manuelGonderilebilirTetikleyiciler(): TetikleyiciTanimi[] {
  return TETIKLEYICILER.filter(
    (t) => t.bolum !== "personel" && t.gecerliDegiskenler.every((d) => MANUEL_DEGISKENLER.includes(d))
  );
}

export function manuelMetniDoldur(sablon: string, degiskenler: { hasta_adi: string; klinik_adi: string }): string {
  return sablon.replace(/\{\{(\w+)\}\}/g, (tam, ad: string) => (degiskenler as Record<string, string>)[ad] ?? tam);
}

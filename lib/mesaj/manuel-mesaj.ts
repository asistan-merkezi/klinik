import { TETIKLEYICILER, type TetikleyiciTanimi } from "./tetikleyiciler";
import { IZINLI_DEGISKENLER, metniDoldur } from "./icerik";

/**
 * Resepsiyon/yönetici hasta detayından elle gönderebilir: hastaya dönük (bölüm personel DEĞİL) şablonlar. Tüm şablonlar yalnız izinli
 * değişkenleri (klinik adı + bağlantı) taşıdığından bağlam gerektirmez; ticari olanlar için hastanın ticari ileti onayı ayrıca aranır.
 */
export function manuelGonderilebilirTetikleyiciler(): TetikleyiciTanimi[] {
  return TETIKLEYICILER.filter((t) => t.bolum !== "personel" && t.gecerliDegiskenler.every((d) => IZINLI_DEGISKENLER.includes(d)));
}

/** Önizleme: gerçek bağlantı gönderim anında üretilir (tek kullanımlık). */
export function manuelOnizleme(sablon: string, klinikAdi: string): string {
  return metniDoldur(sablon, { klinikAdi: klinikAdi || "Klinik", baglanti: "[tek kullanımlık bağlantı]" });
}

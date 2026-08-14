import type { MesajKuyrukDurum } from "@/types/mesajlasma";

/**
 * Merkezden dönen hata kodlarının kalıcı/geçici sınıflandırması — TEK
 * kaynak, kuyruk-isle.ts (ve ileride Faz 4'ün olay tetikleme kodu) bu
 * map'e bakar, kendi if/else zinciri kurmaz.
 *
 * kalici=true  → hemen durum='iptal'|'hata' (retry YOK, kredi merkez
 *                tarafında zaten iade edilmiş/edilmemiş olabilir, klinik
 *                tarafı bunu sorgulamaz — merkezin döndürdüğü kalanBakiye
 *                her durumda güvenilir kabul edilip senkronlanır).
 * kalici=false → geçici, mevcut backoff (5dk/30dk/2sa, 3 deneme) devam
 *                eder, 3. denemeden sonra durum='hata'.
 */
const HATA_KODU_ESLEMESI: Record<string, { kalici: boolean; kaliciDurum?: MesajKuyrukDurum }> = {
  kredi_yetersiz: { kalici: true, kaliciDurum: "iptal" },
  izin_yok: { kalici: true, kaliciDurum: "iptal" },
  gecersiz_alici: { kalici: true, kaliciDurum: "hata" },
  saglayici_hatasi: { kalici: false },
  rate_limit: { kalici: false },
  zaman_asimi: { kalici: false },
};

export function hataDegerlendir(kod: string | undefined): { kalici: boolean; kaliciDurum: MesajKuyrukDurum } {
  const eslesme = kod ? HATA_KODU_ESLEMESI[kod] : undefined;
  // Bilinmeyen/eşleşmeyen kod → geçici kabul edilir (temkinli varsayım:
  // gerçekten kalıcı bir hatayı geçici sayıp 3 kez boşuna denemek, geçici
  // bir hatayı kalıcı sayıp asla denememekten daha az zararlı).
  if (!eslesme) return { kalici: false, kaliciDurum: "hata" };
  return { kalici: eslesme.kalici, kaliciDurum: eslesme.kaliciDurum ?? "hata" };
}

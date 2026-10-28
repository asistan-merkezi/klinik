import { kdvAyristir as kdvAyristirKurus, kurus } from "@/lib/para";

/**
 * hasta_bakiye_hareket.tutar (ve onun iskonto sonrası net hali) hastadan
 * KDV DAHİL tahsil edilen tutar olarak tutuluyor — ayrı bir "KDV tutarı"
 * hiçbir yerde saklanmıyor (bkz. hasta_bakiye_hareket_borc_duzenle RPC'sindeki
 * odeme_kalemi.birim_fiyat/kdv_orani ataması). Kesilen Faturalar liste/detayında
 * "Tutar" (matrah, KDV hariç) ve "KDV" alanlarını göstermek için toplam tutardan
 * geriye doğru ayrıştırıyoruz.
 *
 * KURAL (lib/para.ts, tek yuvarlama tanımı): matrah = toplam × 100 / (100 + oran), kuruşa YARIM YUKARI yuvarlanır;
 * KDV = toplam − matrah. Böylece matrah + KDV her zaman toplama TAM eşittir. Girdi/çıktı TL sayısı (≤2 ondalık).
 */
export function kdvAyristir(toplamTutar: number, kdvOrani: number | string | null | undefined) {
  const r = kdvAyristirKurus(kurus(toplamTutar) ?? 0, kdvOrani);
  return { matrah: r.matrah / 100, kdvTutari: r.kdvTutari / 100 };
}

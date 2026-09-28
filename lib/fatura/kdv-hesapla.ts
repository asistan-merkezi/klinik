/**
 * hasta_bakiye_hareket.tutar (ve onun iskonto sonrası net hali) hastadan
 * KDV DAHİL tahsil edilen tutar olarak tutuluyor — ayrı bir "KDV tutarı"
 * hiçbir yerde saklanmıyor (bkz. hasta_bakiye_hareket_borc_duzenle RPC'sindeki
 * odeme_kalemi.birim_fiyat/kdv_orani ataması, supabase/migrations/
 * 20260927170000_borc_duzenle_muhasebe_hizmet_ismi.sql). Kesilen Faturalar
 * listesi/detayında "Tutar" (matrah, KDV hariç) ve "KDV" (tutar) alanlarını
 * göstermek için toplam tutardan geriye doğru ayrıştırıyoruz — matrah × (1 +
 * oran/100) = toplam.
 */
export function kdvAyristir(toplamTutar: number, kdvOrani: number) {
  if (!kdvOrani || kdvOrani <= 0) {
    return { matrah: toplamTutar, kdvTutari: 0 };
  }
  const matrah = toplamTutar / (1 + kdvOrani / 100);
  return { matrah, kdvTutari: toplamTutar - matrah };
}

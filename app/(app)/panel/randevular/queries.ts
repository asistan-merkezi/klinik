"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type HastaAktifPaket = {
  id: string;
  kalan_adet: number;
  paket: { ad: string; islem_tanimi_id: string; islem_tanimi: { ad: string } | null } | null;
};

/**
 * Randevu formunda hasta seçilince, o hastanın hâlâ hakkı olan (durum='aktif',
 * kalan_adet>0) paketlerini getirir — resepsiyon Tedavi'yi doğru pakete
 * bağlayarak seçebilsin diye (bkz. randevu_gelis_isaretle'nin check-in'de
 * yaptığı otomatik paket/borç eşleştirmesi, burada seçim anında önceden gösteriliyor).
 */
export function useHastaAktifPaketler(hastaId: string) {
  return useQuery({
    queryKey: ["randevu_hasta_aktif_paketler", hastaId],
    enabled: hastaId !== "",
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("paket_satis")
        .select("id, kalan_adet, paket(ad, islem_tanimi_id, islem_tanimi(ad))")
        .eq("hasta_id", hastaId)
        .eq("durum", "aktif")
        .gt("kalan_adet", 0)
        .returns<HastaAktifPaket[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

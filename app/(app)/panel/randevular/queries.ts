"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toUTC } from "@/lib/datetime";
import type { MesgulAraliklar } from "@/lib/randevu/musait-saatler";

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

/**
 * Randevu formunda hasta + tedavi ikisi de seçilince o hastanın kategorisine
 * göre sunucuda hesaplanan tedavi bedelini getirir (bkz. islem_tanimi_etkin_fiyat
 * RPC'si — fiyat/kademeli iskonto oranları tamamen sunucuda, istemci hesaplamaz).
 * Formdaki İskonto alanının yanında gösterilir (bkz. randevu-formu.tsx).
 */
export function useTedaviEtkinFiyat(islemTanimiId: string, hastaId: string) {
  return useQuery({
    queryKey: ["randevu_tedavi_etkin_fiyat", islemTanimiId, hastaId],
    enabled: islemTanimiId !== "" && hastaId !== "",
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("islem_tanimi_etkin_fiyat", {
        p_islem_tanimi_id: islemTanimiId,
        p_hasta_id: hastaId,
      });
      if (error) throw error;
      return data as number | null;
    },
  });
}

/**
 * [basTarih, bitTarih] günleri (İstanbul, iki uç dahil) içinde seçili terapist
 * VEYA odanın dolu olduğu aralıklar + verilen cihazların rezervasyonları (epoch ms).
 * Randevu formlarındaki "Saat" seçicisi bunlarla çakışmayan başlangıçları gösterir
 * (bkz. lib/randevu/musait-saatler.ts). DB'deki exclusion constraint'lerle AYNI
 * kural (iptal/gelmedi hariç); asıl güvence yine constraint. Cihaz sorgusu hata
 * verirse SESSİZCE boş sayılır (fail-open) — kayıt zaten DB'de denetlenir.
 */
export function useMesgulAraliklar(
  basTarih: string,
  bitTarih: string,
  terapistId: string,
  odaId: string,
  cihazIdleri: string[]
) {
  const cihazlar = [...new Set(cihazIdleri)].sort();
  return useQuery({
    queryKey: ["randevu_mesgul_araliklar", basTarih, bitTarih, terapistId, odaId, cihazlar.join(",")],
    enabled: basTarih !== "" && bitTarih !== "" && terapistId !== "" && odaId !== "",
    queryFn: async (): Promise<MesgulAraliklar> => {
      const bas = toUTC(`${basTarih}T00:00:00`);
      const bit = new Date(new Date(toUTC(`${bitTarih}T00:00:00`)).getTime() + 24 * 60 * 60_000).toISOString();
      const supabase = createClient();
      const { data, error } = await supabase
        .from("randevu")
        .select("baslangic, bitis")
        .or(`terapist_id.eq.${terapistId},oda_id.eq.${odaId}`)
        .lt("baslangic", bit)
        .gt("bitis", bas)
        .not("durum", "in", "(iptal,gelmedi)")
        .returns<{ baslangic: string; bitis: string }[]>();
      if (error) throw error;

      let cihaz: MesgulAraliklar["cihaz"] = [];
      if (cihazlar.length > 0) {
        const { data: rez, error: rezHata } = await supabase
          .from("randevu_cihaz_rezervasyon")
          .select("cihaz_id, baslangic, bitis")
          .in("cihaz_id", cihazlar)
          .lt("baslangic", bit)
          .gt("bitis", bas)
          .returns<{ cihaz_id: string; baslangic: string; bitis: string }[]>();
        if (!rezHata && rez) {
          cihaz = rez.map((r) => ({
            cihazId: r.cihaz_id,
            bas: new Date(r.baslangic).getTime(),
            bit: new Date(r.bitis).getTime(),
          }));
        }
      }

      return {
        kaynak: (data ?? []).map((r) => ({ bas: new Date(r.baslangic).getTime(), bit: new Date(r.bitis).getTime() })),
        cihaz,
      };
    },
  });
}

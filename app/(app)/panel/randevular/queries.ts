"use client";

import { useQuery } from "@tanstack/react-query";
import type { MesgulAraliklar } from "@/lib/randevu/musait-saatler";
import { hastaAktifPaketleriGetir, mesgulAraliklariGetir, tedaviEtkinFiyatGetir, type HastaAktifPaketSatiri } from "./veri-actions";

export type HastaAktifPaket = HastaAktifPaketSatiri;

/**
 * Randevu formunda hasta seçilince, o hastanın hâlâ hakkı olan (durum='aktif',
 * kalan_adet>0) paketlerini getirir — resepsiyon Tedavi'yi doğru pakete
 * bağlayarak seçebilsin diye. Veri sunucu eyleminden (oturum + RLS) gelir.
 */
export function useHastaAktifPaketler(hastaId: string) {
  return useQuery({
    queryKey: ["randevu_hasta_aktif_paketler", hastaId],
    enabled: hastaId !== "",
    queryFn: () => hastaAktifPaketleriGetir(hastaId),
  });
}

/**
 * Randevu formunda hasta + tedavi ikisi de seçilince o hastanın kategorisine
 * göre sunucuda hesaplanan tedavi bedelini getirir (islem_tanimi_etkin_fiyat —
 * fiyat/kademeli iskonto tamamen sunucuda, istemci hesaplamaz).
 */
export function useTedaviEtkinFiyat(islemTanimiId: string, hastaId: string) {
  return useQuery({
    queryKey: ["randevu_tedavi_etkin_fiyat", islemTanimiId, hastaId],
    enabled: islemTanimiId !== "" && hastaId !== "",
    queryFn: () => tedaviEtkinFiyatGetir(islemTanimiId, hastaId),
  });
}

/**
 * [basTarih, bitTarih] günleri (İstanbul, iki uç dahil) içinde seçili terapist
 * VEYA odanın dolu olduğu aralıklar + verilen cihazların rezervasyonları (epoch ms).
 * "Saat" seçicisi bunlarla çakışmayan başlangıçları gösterir (lib/randevu/musait-saatler.ts).
 */
export function useMesgulAraliklar(basTarih: string, bitTarih: string, terapistId: string, odaId: string, cihazIdleri: string[]) {
  const cihazlar = [...new Set(cihazIdleri)].sort();
  return useQuery({
    queryKey: ["randevu_mesgul_araliklar", basTarih, bitTarih, terapistId, odaId, cihazlar.join(",")],
    enabled: basTarih !== "" && bitTarih !== "" && terapistId !== "" && odaId !== "",
    queryFn: (): Promise<MesgulAraliklar> => mesgulAraliklariGetir(basTarih, bitTarih, terapistId, odaId, cihazlar),
  });
}

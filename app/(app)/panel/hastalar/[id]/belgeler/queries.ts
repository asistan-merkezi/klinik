"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { BelgeKategori, HastaBelge } from "@/types/hasta-belge";

export function useHastaBelgeler(hastaId: string, kategori: BelgeKategori, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_belge", hastaId, kategori],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hasta_belge")
        .select(
          "id, hasta_id, kategori, belge_turu, bolge, cekim_tarihi, upload_tarihi, karsilastirma_grubu_id, asama, onam_id, storage_path, thumbnail_path, dosya_mime, dosya_boyut_byte, versiyon_no, onceki_belge_id, is_guncel, metadata, yukleyen_kullanici_id"
        )
        .eq("hasta_id", hastaId)
        .eq("kategori", kategori)
        .order("cekim_tarihi", { ascending: false })
        .returns<HastaBelge[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useKlinikFotoOnam(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_onam_klinik_foto", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hasta_onam")
        .select("id, imza_tarihi")
        .eq("hasta_id", hastaId)
        .eq("onam_tipi", "klinik_foto")
        .order("imza_tarihi", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; imza_tarihi: string }>();
      if (error) throw error;
      return data;
    },
  });
}

export function useKarsilastirmaGruplari(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["karsilastirma_gruplari", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hasta_belge")
        .select("karsilastirma_grubu_id")
        .eq("hasta_id", hastaId)
        .eq("kategori", "klinik_foto")
        .not("karsilastirma_grubu_id", "is", null)
        .returns<{ karsilastirma_grubu_id: string }[]>();
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((d) => d.karsilastirma_grubu_id)));
    },
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { BelgeKategori, MusteriBelge } from "@/types/musteri-belge";

export function useMusteriBelgeler(musteriId: string, kategori: BelgeKategori, aktif: boolean) {
  return useQuery({
    queryKey: ["musteri_belge", musteriId, kategori],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_belge")
        .select(
          "id, musteri_id, kategori, belge_turu, bolge, cekim_tarihi, upload_tarihi, karsilastirma_grubu_id, asama, onam_id, storage_path, thumbnail_path, dosya_mime, dosya_boyut_byte, versiyon_no, onceki_belge_id, is_guncel, metadata, yukleyen_kullanici_id"
        )
        .eq("musteri_id", musteriId)
        .eq("kategori", kategori)
        .order("cekim_tarihi", { ascending: false })
        .returns<MusteriBelge[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useKlinikFotoOnam(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["musteri_onam_klinik_foto", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_onam")
        .select("id, imza_tarihi")
        .eq("musteri_id", musteriId)
        .eq("onam_tipi", "klinik_foto")
        .order("imza_tarihi", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; imza_tarihi: string }>();
      if (error) throw error;
      return data;
    },
  });
}

export function useKarsilastirmaGruplari(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["karsilastirma_gruplari", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_belge")
        .select("karsilastirma_grubu_id")
        .eq("musteri_id", musteriId)
        .eq("kategori", "klinik_foto")
        .not("karsilastirma_grubu_id", "is", null)
        .returns<{ karsilastirma_grubu_id: string }[]>();
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((d) => d.karsilastirma_grubu_id)));
    },
  });
}

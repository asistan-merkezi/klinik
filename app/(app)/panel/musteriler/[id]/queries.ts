"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { MusteriHassasSatir } from "@/types/musteri-hassas";
import type {
  MusteriHedef,
  MusteriOlcum,
  MusteriIliski,
  MusteriSigorta,
  MusteriProtokol,
  VucutHaritasiIsareti,
  IslemKontrendikasyon,
  MusteriKarsilastirma,
  MusteriDetayOzet,
} from "@/types/musteri-detay";

export function useMusteriDetayOzet(musteriId: string) {
  return useQuery({
    queryKey: ["musteri_detay_ozet", musteriId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("v_musteri_detay_ozet")
        .select("*")
        .eq("musteri_id", musteriId)
        .maybeSingle<MusteriDetayOzet>();
      if (error) throw error;
      return data;
    },
  });
}

export function useMusteriHassas(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["musteri_hassas", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_hassas")
        .select("*")
        .eq("musteri_id", musteriId)
        .maybeSingle<MusteriHassasSatir>();
      if (error) throw error;
      return data;
    },
  });
}

export function useMusteriIliskiler(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["musteri_iliski", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_iliski")
        .select("id, musteri_id, iliskili_musteri_id, iliski_turu, ortak_odeme, iliskili_musteri:iliskili_musteri_id(ad_soyad, telefon)")
        .eq("musteri_id", musteriId)
        .returns<MusteriIliski[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMusteriSigortalar(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["musteri_sigorta", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_sigorta")
        .select("id, musteri_id, kurum_adi, police_no, katilim_payi_orani, gecerlilik_baslangic, gecerlilik_bitis, fatura_kurum_adina, notlar")
        .eq("musteri_id", musteriId)
        .order("gecerlilik_baslangic", { ascending: false })
        .returns<MusteriSigorta[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMusteriHedefler(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["musteri_hedef", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_hedef")
        .select("id, musteri_id, hedef_tipi, hedef_metrik, baslangic_deger, hedef_deger, hedef_tarihi, durum, olusturan_id, notlar, created_at")
        .eq("musteri_id", musteriId)
        .order("created_at", { ascending: false })
        .returns<MusteriHedef[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useVucutHaritasi(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["vucut_haritasi", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_vucut_haritasi_isareti")
        .select("id, musteri_id, bolge, x, y, severity, not_metni, created_at")
        .eq("musteri_id", musteriId)
        .order("created_at", { ascending: false })
        .returns<VucutHaritasiIsareti[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useIslemTanimlari(aktif: boolean) {
  return useQuery({
    queryKey: ["islem_tanimi_aktif"],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("islem_tanimi")
        .select("id, ad")
        .eq("aktif", true)
        .order("ad")
        .returns<{ id: string; ad: string }[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useIslemKontrendikasyonlari(islemTanimiId: string | null) {
  return useQuery({
    queryKey: ["islem_kontrendikasyon", islemTanimiId],
    enabled: Boolean(islemTanimiId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("islem_kontrendikasyon")
        .select("id, islem_tanimi_id, risk_tipi, uyari_seviyesi, mesaj")
        .eq("islem_tanimi_id", islemTanimiId as string)
        .returns<IslemKontrendikasyon[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMusteriProtokoller(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["musteri_protokol", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_protokol")
        .select("id, musteri_id, islem_tanimi_id, durum, baslangic_tarihi, notlar, uyari_onaylandi_mi, islem_tanimi(ad)")
        .eq("musteri_id", musteriId)
        .order("created_at", { ascending: false })
        .returns<MusteriProtokol[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMusteriOlcumler(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["musteri_olcum", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("musteri_olcum")
        .select("id, musteri_id, olcek_tanimi_id, hesaplanan_skor, olcum_tarihi, cevaplar, olcek_tanimi(id, kod, ad, min_skor, max_skor, yorum_yonu)")
        .eq("musteri_id", musteriId)
        .order("olcum_tarihi", { ascending: true })
        .returns<MusteriOlcum[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMusteriKarsilastirma(musteriId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["musteri_karsilastirma", musteriId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("v_musteri_karsilastirma")
        .select("karsilastirma_grubu_id, belge_id, bolge, asama, cekim_tarihi, storage_path, thumbnail_path")
        .eq("musteri_id", musteriId)
        .returns<MusteriKarsilastirma[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

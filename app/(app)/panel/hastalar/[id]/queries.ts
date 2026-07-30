"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { HastaHassasSatir } from "@/types/hasta-hassas";
import type {
  HastaHedef,
  HastaOlcum,
  HastaIliski,
  HastaSigorta,
  HastaProtokol,
  VucutHaritasiIsareti,
  IslemKontrendikasyon,
  HastaKarsilastirma,
  HastaDetayOzet,
  HastaSeansSatir,
} from "@/types/hasta-detay";

export function useHastaDetayOzet(hastaId: string) {
  return useQuery({
    queryKey: ["hasta_detay_ozet", hastaId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("v_hasta_detay_ozet")
        .select("*")
        .eq("hasta_id", hastaId)
        .maybeSingle<HastaDetayOzet>();
      if (error) throw error;
      return data;
    },
  });
}

export function useHastaHassas(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_hassas", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hasta_hassas")
        .select("*")
        .eq("hasta_id", hastaId)
        .maybeSingle<HastaHassasSatir>();
      if (error) throw error;
      return data;
    },
  });
}

export function useHastaIliskiler(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_iliski", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hasta_iliski")
        .select("id, hasta_id, iliskili_hasta_id, iliski_turu, ortak_odeme, iliskili_hasta:iliskili_hasta_id(ad_soyad, telefon)")
        .eq("hasta_id", hastaId)
        .returns<HastaIliski[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHastaSigortalar(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_sigorta", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hasta_sigorta")
        .select("id, hasta_id, kurum_adi, police_no, katilim_payi_orani, gecerlilik_baslangic, gecerlilik_bitis, fatura_kurum_adina, notlar")
        .eq("hasta_id", hastaId)
        .order("gecerlilik_baslangic", { ascending: false })
        .returns<HastaSigorta[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHastaHedefler(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_hedef", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hasta_hedef")
        .select("id, hasta_id, hedef_tipi, hedef_metrik, baslangic_deger, hedef_deger, hedef_tarihi, durum, olusturan_id, notlar, created_at")
        .eq("hasta_id", hastaId)
        .order("created_at", { ascending: false })
        .returns<HastaHedef[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

function vucutHaritasiQueryKey(hastaId: string, seansId: string | null | undefined) {
  return ["vucut_haritasi", hastaId, seansId ?? "tumu"] as const;
}

export function useVucutHaritasi(hastaId: string, seansId: string | null | undefined, aktif: boolean) {
  return useQuery({
    queryKey: vucutHaritasiQueryKey(hastaId, seansId),
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      let sorgu = supabase
        .from("hasta_vucut_haritasi_isareti")
        .select("id, hasta_id, randevu_id, yuz, bolge, x, y, severity, not_metni, created_at")
        .eq("hasta_id", hastaId);
      sorgu = seansId ? sorgu.eq("randevu_id", seansId) : sorgu;
      const { data, error } = await sorgu
        .order("created_at", { ascending: false })
        .returns<VucutHaritasiIsareti[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

type VucutIsaretiKaydetGirdi = {
  id?: string;
  bolge: string;
  yuz: "on" | "arka";
  severity: number;
  not_metni: string;
  randevu_id: string | null;
};

/** Tabletteki bölge popover'ında Kaydet'e basınca — mevcut işareti günceller (id varsa) ya da yenisini ekler. */
export function useVucutIsaretKaydet(hastaId: string, seansId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = vucutHaritasiQueryKey(hastaId, seansId);

  return useMutation({
    mutationFn: async (girdi: VucutIsaretiKaydetGirdi) => {
      const supabase = createClient();
      if (girdi.id) {
        const { error } = await supabase
          .from("hasta_vucut_haritasi_isareti")
          .update({ severity: girdi.severity, not_metni: girdi.not_metni || null })
          .eq("id", girdi.id);
        if (error) throw error;
        return girdi.id;
      }
      const { data, error } = await supabase
        .from("hasta_vucut_haritasi_isareti")
        .insert({
          hasta_id: hastaId,
          randevu_id: girdi.randevu_id,
          yuz: girdi.yuz,
          bolge: girdi.bolge,
          severity: girdi.severity,
          not_metni: girdi.not_metni || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onMutate: async (girdi) => {
      await queryClient.cancelQueries({ queryKey });
      const onceki = queryClient.getQueryData<VucutHaritasiIsareti[]>(queryKey);
      const geciciId = girdi.id ?? `gecici-${Date.now()}`;
      queryClient.setQueryData<VucutHaritasiIsareti[]>(queryKey, (mevcut) => {
        const liste = mevcut ?? [];
        if (girdi.id) {
          return liste.map((i) =>
            i.id === girdi.id ? { ...i, severity: girdi.severity, not_metni: girdi.not_metni || null } : i
          );
        }
        const yeni: VucutHaritasiIsareti = {
          id: geciciId,
          hasta_id: hastaId,
          randevu_id: girdi.randevu_id,
          yuz: girdi.yuz,
          bolge: girdi.bolge,
          x: null,
          y: null,
          severity: girdi.severity,
          not_metni: girdi.not_metni || null,
          created_at: new Date().toISOString(),
        };
        return [yeni, ...liste];
      });
      return { onceki };
    },
    onError: (_err, _girdi, context) => {
      if (context?.onceki) queryClient.setQueryData(queryKey, context.onceki);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Bölge popover'ında Kaldır'a basınca — işareti tamamen siler. */
export function useVucutIsaretKaldir(hastaId: string, seansId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = vucutHaritasiQueryKey(hastaId, seansId);

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("hasta_vucut_haritasi_isareti").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const onceki = queryClient.getQueryData<VucutHaritasiIsareti[]>(queryKey);
      queryClient.setQueryData<VucutHaritasiIsareti[]>(queryKey, (mevcut) => (mevcut ?? []).filter((i) => i.id !== id));
      return { onceki };
    },
    onError: (_err, _id, context) => {
      if (context?.onceki) queryClient.setQueryData(queryKey, context.onceki);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
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

/** Sağ kolondaki vücut haritasının hangi seansı göstereceğini seçtiren dikey zaman çizelgesi için. */
export function useHastaSeansGecmisi(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_seans_gecmisi", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("randevu")
        .select("id, baslangic, bitis, durum, terapist(personel(ad_soyad))")
        .eq("hasta_id", hastaId)
        .lt("baslangic", new Date().toISOString())
        .order("baslangic", { ascending: false })
        .limit(30)
        .returns<HastaSeansSatir[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHastaProtokoller(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_protokol", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hasta_protokol")
        .select("id, hasta_id, islem_tanimi_id, durum, baslangic_tarihi, notlar, uyari_onaylandi_mi, islem_tanimi(ad)")
        .eq("hasta_id", hastaId)
        .order("created_at", { ascending: false })
        .returns<HastaProtokol[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHastaOlcumler(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_olcum", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("hasta_olcum")
        .select("id, hasta_id, olcek_tanimi_id, hesaplanan_skor, olcum_tarihi, cevaplar, olcek_tanimi(id, kod, ad, min_skor, max_skor, yorum_yonu)")
        .eq("hasta_id", hastaId)
        .order("olcum_tarihi", { ascending: true })
        .returns<HastaOlcum[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useHastaKarsilastirma(hastaId: string, aktif: boolean) {
  return useQuery({
    queryKey: ["hasta_karsilastirma", hastaId],
    enabled: aktif,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("v_hasta_karsilastirma")
        .select("karsilastirma_grubu_id, belge_id, bolge, asama, cekim_tarihi, storage_path, thumbnail_path")
        .eq("hasta_id", hastaId)
        .returns<HastaKarsilastirma[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toUTC } from "@/lib/datetime";

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
 * Seçilen tarih+saat+süre aralığında dolu olan terapist ve odalar — randevu
 * formunda Dr / Terapist ve Oda listelerini yalnız müsait olanlarla sınırlamak
 * için. DB'deki exclusion constraint'lerle AYNI kural (iptal/gelmedi hariç,
 * yarı-açık aralık çakışması); asıl güvence yine constraint, bu yalnız UI kolaylığı.
 */
export function useDoluKaynaklar(tarih: string, saat: string, sureDakika: number) {
  return useQuery({
    queryKey: ["randevu_dolu_kaynaklar", tarih, saat, sureDakika],
    enabled: tarih !== "" && saat !== "" && sureDakika > 0,
    queryFn: async () => {
      const baslangic = toUTC(`${tarih}T${saat}:00`);
      const bitis = new Date(new Date(baslangic).getTime() + sureDakika * 60_000).toISOString();
      const supabase = createClient();
      const { data, error } = await supabase
        .from("randevu")
        .select("terapist_id, oda_id")
        .lt("baslangic", bitis)
        .gt("bitis", baslangic)
        .not("durum", "in", "(iptal,gelmedi)")
        .returns<{ terapist_id: string; oda_id: string }[]>();
      if (error) throw error;
      return {
        terapistler: new Set((data ?? []).map((r) => r.terapist_id)),
        odalar: new Set((data ?? []).map((r) => r.oda_id)),
      };
    },
  });
}

/**
 * Periyodik randevu için: her gün+saat çiftinin İLK yaklaşan tarihinde dolu olan
 * terapist/odaların birleşimi. Seri 5 ay sürdüğünden tüm haftaları denetlemek
 * yerine ilk haftaya bakılır (sonraki dolu haftalar action'da zaten atlanır).
 */
export function useDoluKaynaklarCoklu(slotlar: { tarih: string; saat: string }[], sureDakika: number) {
  const anahtar = slotlar.map((s) => `${s.tarih}T${s.saat}`).join("|");
  return useQuery({
    queryKey: ["randevu_dolu_kaynaklar_coklu", anahtar, sureDakika],
    enabled: slotlar.length > 0 && sureDakika > 0,
    queryFn: async () => {
      const supabase = createClient();
      const sonuclar = await Promise.all(
        slotlar.map(async ({ tarih, saat }) => {
          const baslangic = toUTC(`${tarih}T${saat}:00`);
          const bitis = new Date(new Date(baslangic).getTime() + sureDakika * 60_000).toISOString();
          const { data, error } = await supabase
            .from("randevu")
            .select("terapist_id, oda_id")
            .lt("baslangic", bitis)
            .gt("bitis", baslangic)
            .not("durum", "in", "(iptal,gelmedi)")
            .returns<{ terapist_id: string; oda_id: string }[]>();
          if (error) throw error;
          return data ?? [];
        })
      );
      const tum = sonuclar.flat();
      return {
        terapistler: new Set(tum.map((r) => r.terapist_id)),
        odalar: new Set(tum.map((r) => r.oda_id)),
      };
    },
  });
}

/**
 * Tedavi tanımındaki cihazlı adımların pencereleri (randevu başlangıcından
 * itibaren adımlar sırayla dizilir) mevcut cihaz rezervasyonlarıyla çakışıyor mu?
 * DB'deki asıl kural `randevu_cihaz_rezervasyon` exclusion kısıtıdır (bkz.
 * 20260930140000 migration'ı); bu yalnız formda erken uyarı içindir. Tablo
 * henüz yoksa/sorgu hata verirse SESSİZCE boş döner (fail-open) — kayıt zaten
 * DB'de denetlenir.
 */
export function useCihazCakismalari(
  tarih: string,
  saat: string,
  adimlar: { sure_dakika: number | null; cihaz_id: string | null; cihaz_ad: string | null }[],
  toplamSure: number
) {
  const cihazliAdimVar = adimlar.some((a) => a.cihaz_id);
  const adimAnahtari = adimlar.map((a) => `${a.cihaz_id}:${a.sure_dakika}`).join("|");
  return useQuery({
    queryKey: ["randevu_cihaz_cakismalari", tarih, saat, adimAnahtari, toplamSure],
    enabled: tarih !== "" && saat !== "" && cihazliAdimVar,
    queryFn: async () => {
      const baslangic = new Date(toUTC(`${tarih}T${saat}:00`)).getTime();
      const pencereler: { cihazId: string; ad: string; bas: number; bit: number }[] = [];
      let imlec = baslangic;
      for (const a of adimlar) {
        const bit = a.sure_dakika ? imlec + a.sure_dakika * 60_000 : Math.max(baslangic + toplamSure * 60_000, imlec);
        if (a.cihaz_id && bit > imlec) pencereler.push({ cihazId: a.cihaz_id, ad: a.cihaz_ad ?? "Cihaz", bas: imlec, bit });
        imlec = bit;
      }
      if (pencereler.length === 0) return [];

      const supabase = createClient();
      const { data, error } = await supabase
        .from("randevu_cihaz_rezervasyon")
        .select("cihaz_id, baslangic, bitis")
        .lt("baslangic", new Date(Math.max(...pencereler.map((p) => p.bit))).toISOString())
        .gt("bitis", new Date(baslangic).toISOString())
        .returns<{ cihaz_id: string; baslangic: string; bitis: string }[]>();
      if (error || !data) return [];

      return pencereler
        .filter((p) =>
          data.some(
            (r) =>
              r.cihaz_id === p.cihazId &&
              new Date(r.baslangic).getTime() < p.bit &&
              new Date(r.bitis).getTime() > p.bas
          )
        )
        .map((p) => ({ ad: p.ad, bas: new Date(p.bas).toISOString(), bit: new Date(p.bit).toISOString() }));
    },
  });
}

import type { createClient } from "@/lib/supabase/server";
import type { SecenekSatir } from "@/types/randevu";
import type {
  AnketYanitiSatir,
  BekleyenIptalTalebiSatir,
  BekleyenRandevuTalebiSatir,
  SeansDegerlendirmeSatir,
} from "@/types/portal";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type BildirimVerileri = {
  bekleyenIptalTalepleri: BekleyenIptalTalebiSatir[];
  bekleyenRandevuTalepleri: BekleyenRandevuTalebiSatir[];
  anketYanitlari: AnketYanitiSatir[];
  seansDegerlendirmeleri: SeansDegerlendirmeSatir[];
  hastalar: SecenekSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
};

/**
 * Hastalar > Bildirimler sayfasıyla Ana Ekran'ın paylaştığı tüm veri çekme
 * mantığı — ikisi de aynı 4 kategoriyi (bekleyen randevu talebi/iptal talebi,
 * seans değerlendirmesi, anket yanıtı) aynı şekilde gösteriyor.
 */
export async function bildirimVerileriGetir(supabase: Supabase): Promise<BildirimVerileri> {
  const [
    iptalTalepleriSonucu,
    randevuTalepleriSonucu,
    anketSonucu,
    seansDegerlendirmeSonucu,
    hastaSonucu,
    terapistSonucu,
    odaSonucu,
    cihazSonucu,
    tedaviSonucu,
  ] = await Promise.all([
    supabase
      .from("randevu_iptal_talebi")
      .select("id, durum, created_at, randevu(id, baslangic, durum, hasta(ad_soyad))")
      .eq("durum", "bekliyor")
      .order("created_at")
      .returns<BekleyenIptalTalebiSatir[]>(),
    supabase
      .from("randevu_talebi")
      .select("id, hasta_id, islem_tanimi_id, tercih_tarih, tercih_saat, not_metni, created_at, hasta(ad_soyad), islem_tanimi(ad)")
      .eq("durum", "bekliyor")
      .order("created_at")
      .returns<BekleyenRandevuTalebiSatir[]>(),
    supabase
      .from("anket_yaniti")
      .select("id, puan, oneri_metni, ad_soyad, telefon, created_at, goruldu_tarihi")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<AnketYanitiSatir[]>(),
    supabase
      .from("seans_degerlendirme")
      .select("id, puan, oneri_metni, created_at, goruldu_tarihi, hasta(ad_soyad), randevu(baslangic, terapist(personel(ad_soyad)))")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<SeansDegerlendirmeSatir[]>(),
    supabase.from("hasta").select("id, ad_soyad").order("ad_soyad"),
    supabase
      .from("terapist")
      .select("id, personel(ad_soyad)")
      .returns<{ id: string; personel: { ad_soyad: string } | null }[]>(),
    supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
  ]);

  return {
    bekleyenIptalTalepleri: iptalTalepleriSonucu.data ?? [],
    bekleyenRandevuTalepleri: randevuTalepleriSonucu.data ?? [],
    anketYanitlari: anketSonucu.data ?? [],
    seansDegerlendirmeleri: seansDegerlendirmeSonucu.data ?? [],
    hastalar: (hastaSonucu.data ?? []).map((m) => ({ id: m.id, ad: m.ad_soyad })),
    terapistler: (terapistSonucu.data ?? [])
      .map((t) => ({ id: t.id, ad: t.personel?.ad_soyad ?? "—" }))
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr")),
    odalar: (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad })),
    cihazlar: (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad })),
    tedaviler: (tedaviSonucu.data ?? []).map((t) => ({ id: t.id, ad: t.ad })),
  };
}

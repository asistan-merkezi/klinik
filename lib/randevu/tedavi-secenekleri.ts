import type { createClient } from "@/lib/supabase/server";
import type { TedaviSecenekSatir } from "@/types/randevu";

type TedaviSatir = {
  id: string;
  ad: string;
  sure_dakika: number | null;
  islem_tanimi_adim: { uygulayici_pozisyon_id: string | null }[] | null;
};

/**
 * Randevu oluşturma ekranlarındaki Tedavi seçim listesi — her tedavinin
 * adımlarında tanımlı "uygulayıcı" pozisyon id'lerini de taşır, Personel
 * seçiciyi buna göre daraltmak için (bkz. randevu-formu.tsx). Hiçbir adımda
 * pozisyon tanımlı değilse pozisyon_idleri boş dizi döner = filtre uygulanmaz.
 */
export async function tedaviSecenekleriGetir(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<TedaviSecenekSatir[]> {
  const { data } = await supabase
    .from("islem_tanimi")
    .select("id, ad, sure_dakika, islem_tanimi_adim(uygulayici_pozisyon_id)")
    .eq("aktif", true)
    .order("ad")
    .returns<TedaviSatir[]>();

  return (data ?? []).map((t) => ({
    id: t.id,
    ad: t.ad,
    sure_dakika: t.sure_dakika,
    pozisyon_idleri: Array.from(
      new Set(
        (t.islem_tanimi_adim ?? [])
          .map((a) => a.uygulayici_pozisyon_id)
          .filter((id): id is string => Boolean(id))
      )
    ),
  }));
}

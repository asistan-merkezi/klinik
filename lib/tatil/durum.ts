import type { SupabaseClient } from "@supabase/supabase-js";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { BAYRAM_ADLARI, bayramDurumu, kontrolEdilecekYillar, type Bayram } from "./kurallar";

export type TatilUyarisi = { yil: number; bayram: Bayram; ad: string; durum: "bekliyor" | "eksik" };

/**
 * Klinik yöneticisine gösterilecek resmi tatil uyarıları: kontrol edilen yıllarda (bu yıl;
 * Eylül'den sonra gelecek yıl da) bayram tarihi onay bekliyorsa ya da hiç girilmemişse.
 * RLS'li client ile çağrılır (klinik_admin kendi kliniğinin önerilerini görür).
 */
export async function resmiTatilUyarilariGetir(supabase: SupabaseClient): Promise<TatilUyarisi[]> {
  const yillar = kontrolEdilecekYillar(bugunIstanbulTarihi());
  const [{ data: tatiller }, { data: oneriler }] = await Promise.all([
    supabase
      .from("resmi_tatil")
      .select("tarih, ad")
      .gte("tarih", `${yillar[0]}-01-01`)
      .lt("tarih", `${yillar[yillar.length - 1] + 1}-01-01`),
    supabase.from("resmi_tatil_oneri").select("yil, bayram").eq("durum", "bekliyor").in("yil", yillar),
  ]);

  const uyarilar: TatilUyarisi[] = [];
  for (const yil of yillar) {
    for (const bayram of ["ramazan", "kurban"] as const) {
      const durum = bayramDurumu(bayram, yil, tatiller ?? [], oneriler ?? []);
      if (durum !== "onayli") uyarilar.push({ yil, bayram, ad: BAYRAM_ADLARI[bayram], durum });
    }
  }
  return uyarilar;
}

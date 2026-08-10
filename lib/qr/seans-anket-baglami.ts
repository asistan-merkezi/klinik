import { createClient } from "@/lib/supabase/server";

export async function seansAnketBaglamGetir(
  randevuId: string
): Promise<{ klinikAd: string; zatenDolduruldu: boolean } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seans_degerlendirme_baglam_getir", { p_randevu_id: randevuId });

  if (error || !data || data.length === 0) {
    return null;
  }

  const row = data[0] as { klinik_ad: string; zaten_dolduruldu: boolean };
  return { klinikAd: row.klinik_ad, zatenDolduruldu: row.zaten_dolduruldu };
}

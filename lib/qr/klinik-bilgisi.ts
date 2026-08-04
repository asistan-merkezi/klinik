import { createClient } from "@/lib/supabase/server";

export async function klinikAdGetir(klinikId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("klinik_qr_bilgisi_getir", { p_klinik_id: klinikId });

  if (error || !data || data.length === 0) {
    return null;
  }

  return (data[0] as { ad: string }).ad;
}

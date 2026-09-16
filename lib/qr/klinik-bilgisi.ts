import { createClient } from "@/lib/supabase/server";

export async function klinikQrBilgisiGetir(kisaKod: string): Promise<{ id: string; ad: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("klinik_qr_bilgisi_getir", { p_kisa_kod: kisaKod });

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0] as { id: string; ad: string };
}

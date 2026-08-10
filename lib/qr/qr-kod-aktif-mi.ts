import { createClient } from "@/lib/supabase/server";
import type { QrKodTipi } from "./qr-kod-tanimlari";

/**
 * klinikAdGetir'in ikizi — anonim public form sayfalarının (auth.uid() NULL)
 * bir QR'ın klinik_admin tarafından pasife alınıp alınmadığını sorabilmesi
 * için (bkz. migration 20260811090000, qr_kodu_aktif_mi RPC).
 */
export async function qrKoduAktifMi(klinikId: string, tip: QrKodTipi): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("qr_kodu_aktif_mi", { p_klinik_id: klinikId, p_tip: tip });

  if (error) {
    console.error("qr_kodu_aktif_mi çağrısı başarısız:", error);
    return true;
  }

  return data ?? true;
}

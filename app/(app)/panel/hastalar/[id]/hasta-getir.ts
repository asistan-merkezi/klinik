import type { SupabaseClient } from "@supabase/supabase-js";
import type { HastaDetay } from "@/types/hasta";

export type HastaTemel = Pick<
  HastaDetay,
  | "id"
  | "ad_soyad"
  | "telefon"
  | "dogum_tarihi"
  | "cinsiyet"
  | "risk_bayraklari"
  | "kvkk_onay_tarihi"
  | "ozel_nitelikli_veri_onay_tarihi"
>;

export async function hastaTemelGetir(
  supabase: SupabaseClient,
  id: string
): Promise<HastaTemel | null> {
  const { data } = await supabase
    .from("hasta")
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, cinsiyet, risk_bayraklari, kvkk_onay_tarihi, ozel_nitelikli_veri_onay_tarihi"
    )
    .eq("id", id)
    .single<HastaTemel>();
  return data ?? null;
}

export async function hastaDetayFullGetir(
  supabase: SupabaseClient,
  id: string
): Promise<HastaDetay | null> {
  const { data } = await supabase
    .from("hasta")
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, cinsiyet, eposta, referans_kanali, ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi, risk_bayraklari, " +
        "kvkk_onaylayan_tip, kvkk_onaylayan:kullanici!hasta_kvkk_onaylayan_kullanici_id_fkey(ad_soyad), " +
        "ozel_nitelikli_onaylayan_tip, ozel_nitelikli_onaylayan:kullanici!hasta_ozel_nitelikli_onaylayan_kullanici_id_fkey(ad_soyad), " +
        "ticari_ileti_onaylayan_tip, ticari_ileti_onaylayan:kullanici!hasta_ticari_ileti_onaylayan_kullanici_id_fkey(ad_soyad)"
    )
    .eq("id", id)
    .single<HastaDetay>();
  return data ?? null;
}

export async function kullaniciRolGetir(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase.from("kullanici").select("rol").eq("id", userId).single();
  return data?.rol ?? null;
}

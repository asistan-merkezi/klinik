import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { HastaDetay } from "@/types/hasta";

export type HastaTemel = Pick<
  HastaDetay,
  | "id"
  | "ad_soyad"
  | "telefon"
  | "dogum_tarihi"
  | "cinsiyet"
  | "kategori"
  | "risk_bayraklari"
  | "kvkk_onay_tarihi"
  | "ozel_nitelikli_veri_onay_tarihi"
>;

// Hasta Detay layout'u ve altındaki her sekme sayfası (hub, kişisel, tedavi,
// cari, randevu) aynı auth/hasta/rol sorgularını ayrı ayrı çalıştırıyordu —
// bir tıklamada layout + page ikisi de aynı veriyi tekrar çekiyordu (4-6
// gereksiz round-trip). React'in cache()'i ile bu 3 fonksiyon tek bir
// istek/render ömrü boyunca aynı argümanla ikinci kez çağrıldığında gerçek
// bir sorgu çalıştırmaz, önceki sonucu döner.
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const hastaTemelGetir = cache(async (id: string): Promise<HastaTemel | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hasta")
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, cinsiyet, kategori, risk_bayraklari, kvkk_onay_tarihi, ozel_nitelikli_veri_onay_tarihi"
    )
    .eq("id", id)
    .single<HastaTemel>();
  return data ?? null;
});

export const hastaDetayFullGetir = cache(async (id: string): Promise<HastaDetay | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hasta")
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, cinsiyet, kategori, eposta, referans_kanali, ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi, risk_bayraklari, created_at, " +
        "kvkk_onaylayan_tip, kvkk_onaylayan:kullanici!hasta_kvkk_onaylayan_kullanici_id_fkey(ad_soyad), " +
        "ozel_nitelikli_onaylayan_tip, ozel_nitelikli_onaylayan:kullanici!hasta_ozel_nitelikli_onaylayan_kullanici_id_fkey(ad_soyad), " +
        "ticari_ileti_onaylayan_tip, ticari_ileti_onaylayan:kullanici!hasta_ticari_ileti_onaylayan_kullanici_id_fkey(ad_soyad)"
    )
    .eq("id", id)
    .single<HastaDetay>();
  return data ?? null;
});

export const kullaniciRolGetir = cache(async (userId: string): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("kullanici").select("rol").eq("id", userId).single();
  return data?.rol ?? null;
});

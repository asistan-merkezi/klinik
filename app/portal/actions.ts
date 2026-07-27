"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

export async function portalCikisYap() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/portal/giris");
}

export async function iptalTalebiOlustur(randevuId: string): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/giris");
  }

  const { data: mk } = await supabase
    .from("musteri_kullanici")
    .select("musteri_id")
    .eq("id", user.id)
    .single();

  if (!mk?.musteri_id) {
    return { success: false, message: "Müşteri bilgisi bulunamadı." };
  }

  const { error } = await supabase.from("randevu_iptal_talebi").insert({
    randevu_id: randevuId,
    musteri_id: mk.musteri_id,
  });

  if (error) {
    console.error("İptal talebi oluşturulamadı:", error);
    if (error.code === "23505") {
      return { success: false, message: "Bu randevu için zaten bir talep gönderilmiş." };
    }
    return { success: false, message: "İptal talebi gönderilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/portal");
  return { success: true, message: "İptal talebiniz gönderildi, kliniğinizin onayı bekleniyor." };
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

async function klinikAdminDogrula() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    return null;
  }

  return { supabase, userId: user.id };
}

export async function personelBasvuruDurumGuncelle(
  id: string,
  durum: "onaylandi" | "reddedildi"
): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await yetki.supabase
    .from("personel_basvuru_taslagi")
    .update({
      durum,
      degerlendiren_kullanici_id: yetki.userId,
      degerlendirme_tarihi: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Personel başvuru taslağı güncellenemedi:", error);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/qr-kodlar/personel-basvurulari");
  return { success: true, message: "Güncellendi." };
}

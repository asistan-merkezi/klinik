"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;
type Durum = "yeni" | "incelendi" | "reddedildi" | "kabul_edildi";

export async function isBasvurusuDurumGuncelle(id: string, durum: Durum): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.from("is_basvurusu").update({ durum }).eq("id", id);

  if (error) {
    console.error("İş başvurusu güncellenemedi:", error);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/qr-kodlar/is-basvurulari");
  return { success: true, message: "Güncellendi." };
}

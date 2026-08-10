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

/**
 * Sadece "Beklemede" / "Olumsuz" için — "Olumlu" ayrı bir akış (Personel
 * oluşturma sihirbazını başvuru bilgileriyle açar, bkz. basvuru-satiri.tsx),
 * burada değil actions.ts'teki personelHesabiOlustur içinde işleniyor.
 */
export async function basvuruDurumGuncelle(id: string, durum: "beklemede" | "olumsuz"): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await yetki.supabase
    .from("is_basvurusu")
    .update({
      durum,
      degerlendiren_kullanici_id: yetki.userId,
      degerlendirme_tarihi: new Date().toISOString(),
    })
    .eq("id", id)
    // Zaten bir personele aktarılmış (olumlu) bir başvuru burada geri alınamaz.
    .is("personel_id", null);

  if (error) {
    console.error("İş başvurusu güncellenemedi:", error);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel/basvurular");
  return { success: true, message: "Güncellendi." };
}

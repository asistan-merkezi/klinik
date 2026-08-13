"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { DestekDurum } from "@/types/destek";

type SonucDurumu = { success: boolean; message: string } | null;

const talepSemasi = z.object({
  tur: z.enum(["talep", "sikayet"]),
  konu: z.string().trim().min(1, "Konu gerekli.").max(200),
  aciklama: z.string().trim().min(1, "Açıklama gerekli.").max(4000),
});

export async function talepOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("klinik_id").eq("id", user.id).single();

  if (!kullanici?.klinik_id) {
    return { success: false, message: "Kliniğiniz bulunamadı." };
  }

  const ayristirma = talepSemasi.safeParse({
    tur: formData.get("tur"),
    konu: formData.get("konu"),
    aciklama: formData.get("aciklama"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase.from("destek_talebi").insert({
    klinik_id: kullanici.klinik_id,
    kullanici_id: user.id,
    ...ayristirma.data,
  });

  if (error) {
    console.error("Destek talebi oluşturulamadı:", error);
    return { success: false, message: "Gönderilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/destek/talep-sikayetler");
  return { success: true, message: "Gönderildi." };
}

export async function talepDurumGuncelle(id: string, durum: DestekDurum): Promise<SonucDurumu> {
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

  const { error } = await supabase
    .from("destek_talebi")
    .update({ durum, guncellenme_tarihi: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("Destek talebi durumu güncellenemedi:", error);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/destek/talep-sikayetler");
  return { success: true, message: "Güncellendi." };
}

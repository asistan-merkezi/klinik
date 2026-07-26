"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

const telefonSemasi = z
  .string()
  .trim()
  .min(7, "Telefon numarası geçersiz.")
  .max(20, "Telefon numarası geçersiz.")
  .regex(/^[0-9+ ]+$/, "Telefon sadece rakam, boşluk ve + içerebilir.");

const musteriSemasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  telefon: telefonSemasi,
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  whatsapp_izin_durumu: z.coerce.boolean().optional(),
});

async function klinikIdGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id")
    .eq("id", user.id)
    .single();

  return { supabase, klinikId: kullanici?.klinik_id ?? null };
}

export async function musteriOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();

  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = musteriSemasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    whatsapp_izin_durumu: formData.get("whatsapp_izin_durumu") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad_soyad, telefon, dogum_tarihi, whatsapp_izin_durumu } = ayristirma.data;

  const { error } = await supabase.from("musteri").insert({
    klinik_id: klinikId,
    ad_soyad,
    telefon,
    dogum_tarihi: dogum_tarihi ? dogum_tarihi : null,
    whatsapp_izin_durumu: whatsapp_izin_durumu ?? false,
  });

  if (error) {
    console.error("Müşteri oluşturulamadı:", error);
    return { success: false, message: "Müşteri oluşturulamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/musteriler");
  return { success: true, message: "Müşteri kaydedildi." };
}

export async function musteriGuncelle(
  musteriId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();

  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = musteriSemasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    whatsapp_izin_durumu: formData.get("whatsapp_izin_durumu") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad_soyad, telefon, dogum_tarihi, whatsapp_izin_durumu } = ayristirma.data;

  const { error } = await supabase
    .from("musteri")
    .update({
      ad_soyad,
      telefon,
      dogum_tarihi: dogum_tarihi ? dogum_tarihi : null,
      whatsapp_izin_durumu: whatsapp_izin_durumu ?? false,
    })
    .eq("id", musteriId);

  if (error) {
    console.error("Müşteri güncellenemedi:", error);
    return { success: false, message: "Müşteri güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/musteriler");
  revalidatePath("/panel/randevular");
  return { success: true, message: "Müşteri güncellendi." };
}

export async function kvkkOnayVer(musteriId: string) {
  const { supabase, klinikId } = await klinikIdGetir();

  if (!klinikId) {
    return;
  }

  const { error } = await supabase
    .from("musteri")
    .update({ kvkk_onay_tarihi: new Date().toISOString() })
    .eq("id", musteriId);

  if (error) {
    console.error("KVKK onayı kaydedilemedi:", error);
    return;
  }

  revalidatePath("/panel/musteriler");
}

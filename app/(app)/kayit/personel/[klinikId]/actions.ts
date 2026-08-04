"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isimBasHarfBuyukYap } from "@/lib/utils";

type SonucDurumu = { success: boolean; message: string } | null;

const telefonSemasi = z
  .string()
  .trim()
  .min(7, "Telefon numarası geçersiz.")
  .max(20, "Telefon numarası geçersiz.")
  .regex(/^[0-9+ ]+$/, "Telefon sadece rakam, boşluk ve + içerebilir.");

const semasi = z.object({
  klinik_id: z.string().uuid("Geçersiz bağlantı."),
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  telefon: telefonSemasi,
  eposta: z.union([z.string().trim().email("Geçersiz e-posta."), z.literal("")]).optional(),
  basvurulan_gorev: z.string().trim().optional(),
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  mesaj: z.string().trim().optional(),
});

export async function personelBasvuruTaslagiOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    klinik_id: formData.get("klinik_id"),
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    eposta: formData.get("eposta") ?? "",
    basvurulan_gorev: formData.get("basvurulan_gorev") ?? "",
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    mesaj: formData.get("mesaj") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { klinik_id, ad_soyad, telefon, eposta, basvurulan_gorev, dogum_tarihi, mesaj } = ayristirma.data;

  const supabase = await createClient();

  const { error } = await supabase.from("personel_basvuru_taslagi").insert({
    klinik_id,
    ad_soyad: isimBasHarfBuyukYap(ad_soyad),
    telefon,
    eposta: eposta || null,
    basvurulan_gorev: basvurulan_gorev || null,
    dogum_tarihi: dogum_tarihi ? dogum_tarihi : null,
    mesaj: mesaj || null,
  });

  if (error) {
    console.error("Personel başvuru taslağı oluşturulamadı:", error);
    return { success: false, message: "Başvurunuz kaydedilemedi, lütfen tekrar deneyin." };
  }

  return {
    success: true,
    message: "Başvurunuz alındı. Klinik yönetimi başvurunuzu değerlendirip sizinle iletişime geçecektir.",
  };
}

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
  pozisyon: z.string().trim().optional(),
  mesaj: z.string().trim().optional(),
});

export async function isBasvurusuOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    klinik_id: formData.get("klinik_id"),
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    eposta: formData.get("eposta") ?? "",
    pozisyon: formData.get("pozisyon") ?? "",
    mesaj: formData.get("mesaj") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { klinik_id, ad_soyad, telefon, eposta, pozisyon, mesaj } = ayristirma.data;

  const supabase = await createClient();

  const { error } = await supabase.from("is_basvurusu").insert({
    klinik_id,
    ad_soyad: isimBasHarfBuyukYap(ad_soyad),
    telefon,
    eposta: eposta || null,
    pozisyon: pozisyon || null,
    mesaj: mesaj || null,
  });

  if (error) {
    console.error("İş başvurusu oluşturulamadı:", error);
    return { success: false, message: "Başvurunuz kaydedilemedi, lütfen tekrar deneyin." };
  }

  return { success: true, message: "Başvurunuz alındı. Teşekkür ederiz." };
}

"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isimBasHarfBuyukYap } from "@/lib/utils";

type SonucDurumu = { success: boolean; message: string } | null;

const semasi = z
  .object({
    klinik_id: z.string().uuid("Geçersiz bağlantı."),
    puan: z.union([z.coerce.number().int().min(1).max(5), z.literal("")]).optional(),
    oneri_metni: z.string().trim().optional(),
    ad_soyad: z.string().trim().optional(),
    telefon: z.string().trim().optional(),
  })
  .refine((v) => (v.puan !== "" && v.puan !== undefined) || (v.oneri_metni && v.oneri_metni.length > 0), {
    message: "Lütfen bir puan verin veya öneri yazın.",
  });

export async function anketYanitiOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    klinik_id: formData.get("klinik_id"),
    puan: formData.get("puan") ?? "",
    oneri_metni: formData.get("oneri_metni") ?? "",
    ad_soyad: formData.get("ad_soyad") ?? "",
    telefon: formData.get("telefon") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { klinik_id, puan, oneri_metni, ad_soyad, telefon } = ayristirma.data;

  const supabase = await createClient();

  const { error } = await supabase.from("anket_yaniti").insert({
    klinik_id,
    puan: puan === "" || puan === undefined ? null : puan,
    oneri_metni: oneri_metni || null,
    ad_soyad: ad_soyad ? isimBasHarfBuyukYap(ad_soyad) : null,
    telefon: telefon || null,
  });

  if (error) {
    console.error("Anket yanıtı oluşturulamadı:", error);
    return { success: false, message: "Gönderilemedi, lütfen tekrar deneyin." };
  }

  return { success: true, message: "Geri bildiriminiz için teşekkür ederiz." };
}

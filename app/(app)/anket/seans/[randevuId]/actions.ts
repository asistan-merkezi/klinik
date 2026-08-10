"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

const semasi = z
  .object({
    randevu_id: z.string().uuid("Geçersiz bağlantı."),
    puan: z.union([z.coerce.number().int().min(1).max(5), z.literal("")]).optional(),
    oneri_metni: z.string().trim().optional(),
  })
  .refine((v) => (v.puan !== "" && v.puan !== undefined) || (v.oneri_metni && v.oneri_metni.length > 0), {
    message: "Lütfen bir puan verin veya öneri yazın.",
  });

export async function seansDegerlendirmeOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    randevu_id: formData.get("randevu_id"),
    puan: formData.get("puan") ?? "",
    oneri_metni: formData.get("oneri_metni") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { randevu_id, puan, oneri_metni } = ayristirma.data;
  const supabase = await createClient();

  const { error } = await supabase.from("seans_degerlendirme").insert({
    randevu_id,
    puan: puan === "" || puan === undefined ? null : puan,
    oneri_metni: oneri_metni || null,
  });

  if (error) {
    console.error("Seans değerlendirmesi oluşturulamadı:", error);
    if (error.code === "23505") {
      return { success: false, message: "Bu seans için zaten bir değerlendirme alındı." };
    }
    return { success: false, message: "Gönderilemedi, lütfen tekrar deneyin." };
  }

  return { success: true, message: "Değerlendirmeniz için teşekkür ederiz." };
}

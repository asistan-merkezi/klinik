"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

const odemeSemasi = z.object({
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

export async function odemeEkle(
  personelId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();

  if (!kullanici || kullanici.rol !== "klinik_admin" || !kullanici.klinik_id) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = odemeSemasi.safeParse({
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { tutar, tarih, aciklama } = ayristirma.data;

  const { error } = await supabase.from("personel_odeme").insert({
    klinik_id: kullanici.klinik_id,
    personel_id: personelId,
    tutar,
    tarih,
    aciklama: aciklama ? aciklama : null,
    odeyen_kullanici_id: user.id,
  });

  if (error) {
    console.error("Personel ödemesi kaydedilemedi:", error);
    return { success: false, message: "Ödeme kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel/takip");
  return { success: true, message: "Ödeme kaydedildi." };
}

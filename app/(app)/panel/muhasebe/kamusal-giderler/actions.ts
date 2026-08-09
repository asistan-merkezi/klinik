"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

const giderSemasi = z.object({
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
});

// Kategori burada bilinçli olarak 'vergi_sgk' ile sabit — bu form sadece
// Kamusal Giderler (Muhasebe > Kamusal Giderler) için, klinik_harcama'daki
// diğer kategoriler (kira/fatura/malzeme/diğer) ayrı "Giderler" ekranının işi.
export async function kamusalGiderEkle(
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

  const ayristirma = giderSemasi.safeParse({
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { tutar, tarih, aciklama } = ayristirma.data;

  const { error } = await supabase.from("klinik_harcama").insert({
    klinik_id: kullanici.klinik_id,
    kategori: "vergi_sgk",
    tutar,
    tarih,
    aciklama: aciklama ? aciklama : null,
    olusturan_kullanici_id: user.id,
  });

  if (error) {
    console.error("Kamusal gider kaydedilemedi:", error);
    return { success: false, message: "Gider kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/muhasebe/kamusal-giderler");
  revalidatePath("/panel/muhasebe/raporlar");
  return { success: true, message: "Gider kaydedildi." };
}

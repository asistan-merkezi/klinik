"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

async function yetkiliKlinikAdminGetir() {
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

  if (kullanici?.rol !== "klinik_admin" || !kullanici.klinik_id) {
    return { supabase, klinikId: null as string | null, yetkisiz: true as const };
  }

  return { supabase, klinikId: kullanici.klinik_id, yetkisiz: false as const };
}

const tabletAyarlariSemasi = z.object({
  hasta_adi_goster: z.boolean(),
  terapist_adi_goster: z.boolean(),
  islem_adi_goster: z.boolean(),
  durum_rengi_goster: z.boolean(),
});

export async function tabletAyarlariGuncelle(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = tabletAyarlariSemasi.safeParse({
    hasta_adi_goster: formData.get("hasta_adi_goster") === "on",
    terapist_adi_goster: formData.get("terapist_adi_goster") === "on",
    islem_adi_goster: formData.get("islem_adi_goster") === "on",
    durum_rengi_goster: formData.get("durum_rengi_goster") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: "Girdi hatalı." };
  }

  // klinik_ayarlar.ayarlar tek bir jsonb kolonu ("tablet" dışında gelecekte başka
  // özellikler de aynı kolonda tutulabilir) — düz upsert diğer anahtarları silebileceği
  // için önce mevcut değeri okuyup üstüne "tablet" anahtarını yazıyoruz.
  const { data: mevcutSatir } = await supabase
    .from("klinik_ayarlar")
    .select("ayarlar")
    .eq("klinik_id", klinikId)
    .maybeSingle();

  const guncelAyarlar = {
    ...(mevcutSatir?.ayarlar as Record<string, unknown> | null),
    tablet: ayristirma.data,
  };

  const { error } = await supabase
    .from("klinik_ayarlar")
    .upsert({ klinik_id: klinikId, ayarlar: guncelAyarlar }, { onConflict: "klinik_id" });

  if (error) {
    console.error("Tablet görünüm ayarları güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/tablet/ayarlar");
  return { success: true, message: "Tablet görünüm ayarları kaydedildi." };
}

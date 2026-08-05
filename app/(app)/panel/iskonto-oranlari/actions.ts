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

const yuzdeSemasi = z.coerce.number().min(0, "0-100 arasında olmalı.").max(100, "0-100 arasında olmalı.");

const oranlarSemasi = z.object({
  vita_pct: yuzdeSemasi,
  plus_pct: yuzdeSemasi,
  elit_pct: yuzdeSemasi,
  prime_pct: yuzdeSemasi,
});

export async function iskontoOranlariGuncelle(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = oranlarSemasi.safeParse({
    vita_pct: formData.get("vita_pct"),
    plus_pct: formData.get("plus_pct"),
    elit_pct: formData.get("elit_pct"),
    prime_pct: formData.get("prime_pct"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase
    .from("iskonto_oranlari")
    .upsert({ klinik_id: klinikId, ...ayristirma.data }, { onConflict: "klinik_id" });

  if (error) {
    console.error("İskonto oranları güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/iskonto-oranlari");
  return { success: true, message: "İskonto oranları kaydedildi." };
}

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

function bosIseNull(deger: FormDataEntryValue | null) {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

const muhasebeSyncSemasi = z.object({
  parasut_client_id: z.string().trim().min(1, "Client ID gerekli."),
  parasut_client_secret: z.string().nullable(),
  parasut_company_id: z.string().trim().min(1, "Şirket (Company) ID gerekli."),
});

export async function muhasebeSyncGuncelle(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = muhasebeSyncSemasi.safeParse({
    parasut_client_id: formData.get("parasut_client_id"),
    parasut_client_secret: bosIseNull(formData.get("parasut_client_secret")),
    parasut_company_id: formData.get("parasut_company_id"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { parasut_client_id, parasut_client_secret, parasut_company_id } = ayristirma.data;

  // Secret alanı boş bırakılırsa mevcut değer korunur (formda hiçbir zaman
  // gösterilmediği için "boş = değiştirme" anlamına gelir).
  const { data: mevcut } = await supabase
    .from("klinik_muhasebe_entegrasyonu")
    .select("parasut_client_secret")
    .eq("klinik_id", klinikId)
    .maybeSingle();

  const kayitEdilecekSecret = parasut_client_secret ?? mevcut?.parasut_client_secret ?? null;
  const baglandiMi = Boolean(parasut_client_id && parasut_company_id && kayitEdilecekSecret);

  const { error } = await supabase.from("klinik_muhasebe_entegrasyonu").upsert(
    {
      klinik_id: klinikId,
      parasut_client_id,
      parasut_client_secret: kayitEdilecekSecret,
      parasut_company_id,
      baglanti_durumu: baglandiMi ? "baglandi" : "bekliyor",
    },
    { onConflict: "klinik_id" }
  );

  if (error) {
    console.error("Muhasebe Sync ayarları kaydedilemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/muhasebe-sync");
  return { success: true, message: "Muhasebe Sync bilgileri kaydedildi." };
}

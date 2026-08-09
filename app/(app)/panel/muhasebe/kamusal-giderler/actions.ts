"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ARAC_GEREKTIREN_TIPLER } from "@/types/kamusal-odeme";

type SonucDurumu = { success: boolean; message: string } | null;

// Migration 20260809120000'daki kamusal_odeme.odeme_tipi CHECK'iyle birebir aynı liste.
const odemeSemasi = z.object({
  odeme_tipi: z.enum([
    "kdv",
    "stopaj_muhtasar",
    "sgk_primleri",
    "damga_vergisi",
    "emlak_vergisi",
    "motorlu_tasitlar_vergisi",
    "bagkur_primleri",
    "muhasebe_ucreti",
    "trafik_cezasi",
    "gec_odeme_faizi",
    "gecici_vergi",
    "kurumlar_vergisi",
  ]),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  donem_ay: z.coerce.number().int().min(1, "Dönem ayı seçilmeli.").max(12, "Dönem ayı seçilmeli."),
  donem_yil: z.coerce.number().int().min(2000, "Dönem yılı geçersiz.").max(2100, "Dönem yılı geçersiz."),
  vade_tarihi: z.string().min(1, "Vade tarihi seçilmeli."),
  odeme_tarihi: z.string().trim().optional(),
  notlar: z.string().trim().optional(),
  arac_id: z.string().trim().optional(),
});

async function yetkiliBaglantiGetir() {
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

  return { supabase, user, klinikId: kullanici?.klinik_id ?? null, rol: kullanici?.rol ?? null };
}

function formVerisiOku(formData: FormData) {
  return odemeSemasi.safeParse({
    odeme_tipi: formData.get("odeme_tipi"),
    tutar: formData.get("tutar"),
    donem_ay: formData.get("donem_ay"),
    donem_yil: formData.get("donem_yil"),
    vade_tarihi: formData.get("vade_tarihi"),
    odeme_tarihi: formData.get("odeme_tarihi") ?? "",
    notlar: formData.get("notlar") ?? "",
  });
}

export async function kamusalOdemeEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, user, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { odeme_tipi, tutar, donem_ay, donem_yil, vade_tarihi, odeme_tarihi, notlar, arac_id } = ayristirma.data;

  if (ARAC_GEREKTIREN_TIPLER.includes(odeme_tipi) && !arac_id) {
    return { success: false, message: "Bu ödeme tipi için araç seçilmeli." };
  }

  const { error } = await supabase.from("kamusal_odeme").insert({
    klinik_id: klinikId,
    odeme_tipi,
    tutar,
    donem_ay,
    donem_yil,
    vade_tarihi,
    odeme_tarihi: odeme_tarihi ? odeme_tarihi : null,
    notlar: notlar ? notlar : null,
    arac_id: ARAC_GEREKTIREN_TIPLER.includes(odeme_tipi) && arac_id ? arac_id : null,
    olusturan_kullanici_id: user!.id,
  });

  if (error) {
    console.error("Kamusal ödeme kaydedilemedi:", error);
    return { success: false, message: "Ödeme kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/muhasebe/kamusal-giderler");
  revalidatePath("/panel/muhasebe/raporlar");
  return { success: true, message: "Ödeme kaydedildi." };
}

export async function kamusalOdemeGuncelle(
  id: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { odeme_tipi, tutar, donem_ay, donem_yil, vade_tarihi, odeme_tarihi, notlar, arac_id } = ayristirma.data;

  if (ARAC_GEREKTIREN_TIPLER.includes(odeme_tipi) && !arac_id) {
    return { success: false, message: "Bu ödeme tipi için araç seçilmeli." };
  }

  const { error } = await supabase
    .from("kamusal_odeme")
    .update({
      odeme_tipi,
      tutar,
      donem_ay,
      donem_yil,
      vade_tarihi,
      odeme_tarihi: odeme_tarihi ? odeme_tarihi : null,
      notlar: notlar ? notlar : null,
      arac_id: ARAC_GEREKTIREN_TIPLER.includes(odeme_tipi) && arac_id ? arac_id : null,
    })
    .eq("id", id);

  if (error) {
    console.error("Kamusal ödeme güncellenemedi:", error);
    return { success: false, message: "Ödeme güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/muhasebe/kamusal-giderler");
  revalidatePath("/panel/muhasebe/raporlar");
  return { success: true, message: "Ödeme güncellendi." };
}

export async function kamusalOdemeSil(id: string): Promise<SonucDurumu> {
  const { supabase, rol } = await yetkiliBaglantiGetir();
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.from("kamusal_odeme").delete().eq("id", id);

  if (error) {
    console.error("Kamusal ödeme silinemedi:", error);
    return { success: false, message: "Ödeme silinemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/muhasebe/kamusal-giderler");
  revalidatePath("/panel/muhasebe/raporlar");
  return { success: true, message: "Ödeme silindi." };
}

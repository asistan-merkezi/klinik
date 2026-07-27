"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

const islemSemasi = z.object({
  ad: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  islem_kategori_id: z.string().uuid("Kategori seçilmeli."),
  gerekli_cihaz_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  fiyat: z.coerce.number().min(0, "Fiyat 0'dan küçük olamaz."),
  kdv_orani: z.coerce.number().min(0, "KDV 0-100 arasında olmalı.").max(100, "KDV 0-100 arasında olmalı."),
  parasut_hizmet_kodu: z.string().trim().optional(),
  muhasebe_hizmet_ismi: z.string().trim().optional(),
});

async function klinikIdGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id")
    .eq("id", user.id)
    .single();

  return { supabase, klinikId: kullanici?.klinik_id ?? null };
}

function ayristir(formData: FormData) {
  return islemSemasi.safeParse({
    ad: formData.get("ad"),
    islem_kategori_id: formData.get("islem_kategori_id"),
    gerekli_cihaz_id: formData.get("gerekli_cihaz_id") ?? "",
    fiyat: formData.get("fiyat"),
    kdv_orani: formData.get("kdv_orani"),
    parasut_hizmet_kodu: formData.get("parasut_hizmet_kodu") ?? "",
    muhasebe_hizmet_ismi: formData.get("muhasebe_hizmet_ismi") ?? "",
  });
}

export async function islemTanimiOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = ayristir(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const {
    ad,
    islem_kategori_id,
    gerekli_cihaz_id,
    fiyat,
    kdv_orani,
    parasut_hizmet_kodu,
    muhasebe_hizmet_ismi,
  } = ayristirma.data;

  const { error } = await supabase.from("islem_tanimi").insert({
    klinik_id: klinikId,
    ad,
    islem_kategori_id,
    gerekli_cihaz_id: gerekli_cihaz_id ? gerekli_cihaz_id : null,
    fiyat,
    kdv_orani,
    parasut_hizmet_kodu: parasut_hizmet_kodu ? parasut_hizmet_kodu : null,
    muhasebe_hizmet_ismi: muhasebe_hizmet_ismi ? muhasebe_hizmet_ismi : null,
  });

  if (error) {
    console.error("İşlem tanımı oluşturulamadı:", error);
    if (error.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "İşlem tanımı eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/islemler");
  return { success: true, message: "İşlem tanımı eklendi." };
}

export async function islemTanimiGuncelle(
  islemId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = ayristir(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const {
    ad,
    islem_kategori_id,
    gerekli_cihaz_id,
    fiyat,
    kdv_orani,
    parasut_hizmet_kodu,
    muhasebe_hizmet_ismi,
  } = ayristirma.data;

  const { error } = await supabase
    .from("islem_tanimi")
    .update({
      ad,
      islem_kategori_id,
      gerekli_cihaz_id: gerekli_cihaz_id ? gerekli_cihaz_id : null,
      fiyat,
      kdv_orani,
      parasut_hizmet_kodu: parasut_hizmet_kodu ? parasut_hizmet_kodu : null,
      muhasebe_hizmet_ismi: muhasebe_hizmet_ismi ? muhasebe_hizmet_ismi : null,
    })
    .eq("id", islemId);

  if (error) {
    console.error("İşlem tanımı güncellenemedi:", error);
    if (error.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "İşlem tanımı güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/islemler");
  return { success: true, message: "İşlem tanımı güncellendi." };
}

export async function islemTanimiAktifDurumDegistir(islemId: string, yeniDurum: boolean) {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return;
  }

  const { error } = await supabase
    .from("islem_tanimi")
    .update({ aktif: yeniDurum })
    .eq("id", islemId);

  if (error) {
    console.error("İşlem tanımı durumu güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/islemler");
}

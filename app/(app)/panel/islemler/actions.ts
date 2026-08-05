"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

// Boş bırakılan kademe fiyatı (plus/elit/prime) null'a düşer — o kademe için
// override yok demektir, islem_tanimi_etkin_fiyat() vita_fiyat + iskonto
// oranından hesaplar (bkz. 20260805110000_hasta_kategori_iskonto_oranlari.sql).
const kademeFiyatiSemasi = z
  .union([z.coerce.number().min(0, "Fiyat 0'dan küçük olamaz."), z.literal("")])
  .optional()
  .transform((deger) => (deger === "" || deger === undefined ? null : deger));

const islemSemasi = z.object({
  ad: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  gerekli_cihaz_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  vita_fiyat: z.coerce.number().min(0, "Fiyat 0'dan küçük olamaz."),
  plus_fiyat: kademeFiyatiSemasi,
  elit_fiyat: kademeFiyatiSemasi,
  prime_fiyat: kademeFiyatiSemasi,
  kdv_orani: z.coerce.number().min(0, "KDV 0-100 arasında olmalı.").max(100, "KDV 0-100 arasında olmalı."),
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
    gerekli_cihaz_id: formData.get("gerekli_cihaz_id") ?? "",
    vita_fiyat: formData.get("vita_fiyat"),
    plus_fiyat: formData.get("plus_fiyat") ?? "",
    elit_fiyat: formData.get("elit_fiyat") ?? "",
    prime_fiyat: formData.get("prime_fiyat") ?? "",
    kdv_orani: formData.get("kdv_orani"),
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

  const { ad, gerekli_cihaz_id, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, muhasebe_hizmet_ismi } =
    ayristirma.data;

  const { error } = await supabase.from("islem_tanimi").insert({
    klinik_id: klinikId,
    ad,
    gerekli_cihaz_id: gerekli_cihaz_id ? gerekli_cihaz_id : null,
    vita_fiyat,
    plus_fiyat,
    elit_fiyat,
    prime_fiyat,
    kdv_orani,
    muhasebe_hizmet_ismi: muhasebe_hizmet_ismi ? muhasebe_hizmet_ismi : null,
  });

  if (error) {
    console.error("Tedavi tanımı oluşturulamadı:", error);
    if (error.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "Tedavi tanımı eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/islemler");
  return { success: true, message: "Tedavi tanımı eklendi." };
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

  const { ad, gerekli_cihaz_id, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, muhasebe_hizmet_ismi } =
    ayristirma.data;

  const { error } = await supabase
    .from("islem_tanimi")
    .update({
      ad,
      gerekli_cihaz_id: gerekli_cihaz_id ? gerekli_cihaz_id : null,
      vita_fiyat,
      plus_fiyat,
      elit_fiyat,
      prime_fiyat,
      kdv_orani,
      muhasebe_hizmet_ismi: muhasebe_hizmet_ismi ? muhasebe_hizmet_ismi : null,
    })
    .eq("id", islemId);

  if (error) {
    console.error("Tedavi tanımı güncellenemedi:", error);
    if (error.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "Tedavi tanımı güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/islemler");
  return { success: true, message: "Tedavi tanımı güncellendi." };
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
    console.error("Tedavi tanımı durumu güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/islemler");
}

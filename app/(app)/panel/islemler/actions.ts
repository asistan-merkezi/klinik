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

const adimSemasi = z.object({
  id: z.string().uuid().optional(),
  ad: z.string().trim().min(2, "İşlem adı en az 2 karakter olmalı."),
  uygulayici_pozisyon_id: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  gerekli_cihaz_id: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  sure_dakika: z
    .union([z.coerce.number().int().min(1, "Süre 1 dakikadan az olamaz."), z.literal(""), z.null()])
    .optional()
    .transform((deger) => (deger === "" || deger === null || deger === undefined ? null : deger)),
});

const islemSemasi = z.object({
  ad: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  vita_fiyat: z.coerce.number().min(0, "Fiyat 0'dan küçük olamaz."),
  plus_fiyat: kademeFiyatiSemasi,
  elit_fiyat: kademeFiyatiSemasi,
  prime_fiyat: kademeFiyatiSemasi,
  kdv_orani: z.coerce.number().min(0, "KDV 0-100 arasında olmalı.").max(100, "KDV 0-100 arasında olmalı."),
  muhasebe_hizmet_ismi: z.string().trim().optional(),
  adimlar: z.array(adimSemasi).min(1, "En az bir işlem eklenmeli."),
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
  let adimlarHam: unknown = [];
  try {
    adimlarHam = JSON.parse(String(formData.get("adimlar") ?? "[]"));
  } catch {
    adimlarHam = [];
  }

  return islemSemasi.safeParse({
    ad: formData.get("ad"),
    vita_fiyat: formData.get("vita_fiyat"),
    plus_fiyat: formData.get("plus_fiyat") ?? "",
    elit_fiyat: formData.get("elit_fiyat") ?? "",
    prime_fiyat: formData.get("prime_fiyat") ?? "",
    kdv_orani: formData.get("kdv_orani"),
    muhasebe_hizmet_ismi: formData.get("muhasebe_hizmet_ismi") ?? "",
    adimlar: adimlarHam,
  });
}

async function islemTanimiKaydet(islemId: string | null, formData: FormData): Promise<SonucDurumu> {
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
    vita_fiyat,
    plus_fiyat,
    elit_fiyat,
    prime_fiyat,
    kdv_orani,
    muhasebe_hizmet_ismi,
    adimlar,
  } = ayristirma.data;

  const { error } = await supabase.rpc("islem_tanimi_kaydet", {
    p_id: islemId,
    p_ad: ad,
    p_vita_fiyat: vita_fiyat,
    p_plus_fiyat: plus_fiyat,
    p_elit_fiyat: elit_fiyat,
    p_prime_fiyat: prime_fiyat,
    p_kdv_orani: kdv_orani,
    p_muhasebe_hizmet_ismi: muhasebe_hizmet_ismi ? muhasebe_hizmet_ismi : null,
    p_adimlar: adimlar.map((a) => ({
      id: a.id ?? null,
      ad: a.ad,
      uygulayici_pozisyon_id: a.uygulayici_pozisyon_id ? a.uygulayici_pozisyon_id : null,
      gerekli_cihaz_id: a.gerekli_cihaz_id ? a.gerekli_cihaz_id : null,
      sure_dakika: a.sure_dakika,
    })),
  });

  if (error) {
    console.error(`Tedavi tanımı ${islemId ? "güncellenemedi" : "oluşturulamadı"}:`, error);
    if (error.code === "42501" || error.message?.includes("yetkisiz")) {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return {
      success: false,
      message: islemId
        ? "Tedavi tanımı güncellenemedi, lütfen tekrar deneyin."
        : "Tedavi tanımı eklenemedi, lütfen tekrar deneyin.",
    };
  }

  revalidatePath("/panel/islemler");
  return { success: true, message: islemId ? "Tedavi tanımı güncellendi." : "Tedavi tanımı eklendi." };
}

export async function islemTanimiOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  return islemTanimiKaydet(null, formData);
}

export async function islemTanimiGuncelle(
  islemId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  return islemTanimiKaydet(islemId, formData);
}

const sablonSemasi = z.object({
  ad: z.string().trim().min(2, "İşlem adı en az 2 karakter olmalı."),
  uygulayici_pozisyon_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  sure_dakika: z
    .union([z.coerce.number().int().min(1, "Süre 1 dakikadan az olamaz."), z.literal("")])
    .optional()
    .transform((deger) => (deger === "" || deger === undefined ? null : deger)),
});

export async function islemAdimiSablonuOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = sablonSemasi.safeParse({
    ad: formData.get("ad"),
    uygulayici_pozisyon_id: formData.get("uygulayici_pozisyon_id") ?? "",
    sure_dakika: formData.get("sure_dakika") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad, uygulayici_pozisyon_id, sure_dakika } = ayristirma.data;

  const { error } = await supabase.from("islem_adimi_sablonu").insert({
    klinik_id: klinikId,
    ad,
    uygulayici_pozisyon_id: uygulayici_pozisyon_id ? uygulayici_pozisyon_id : null,
    sure_dakika,
  });

  if (error) {
    console.error("İşlem tanımlama eklenemedi:", error);
    if (error.code === "23505") {
      return { success: false, message: "Bu isimde bir işlem tanımı zaten var." };
    }
    if (error.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "İşlem tanımı eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/islemler");
  revalidatePath("/panel/islemler/tanimlamalar");
  return { success: true, message: "İşlem tanımı eklendi." };
}

const sablonGuncelleSemasi = z.object({
  ad: z.string().trim().min(2, "İşlem adı en az 2 karakter olmalı."),
  uygulayici_pozisyon_id: z.string().uuid().nullable(),
  sure_dakika: z.number().int().min(1, "Süre 1 dakikadan az olamaz.").nullable(),
});

export async function islemAdimiSablonuGuncelle(
  sablonId: string,
  veri: { ad: string; uygulayici_pozisyon_id: string | null; sure_dakika: number | null }
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = sablonGuncelleSemasi.safeParse(veri);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad, uygulayici_pozisyon_id, sure_dakika } = ayristirma.data;

  const { error } = await supabase
    .from("islem_adimi_sablonu")
    .update({ ad, uygulayici_pozisyon_id, sure_dakika })
    .eq("id", sablonId);

  if (error) {
    console.error("İşlem tanımlama güncellenemedi:", error);
    if (error.code === "23505") {
      return { success: false, message: "Bu isimde bir işlem tanımı zaten var." };
    }
    if (error.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "İşlem tanımı güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/islemler");
  revalidatePath("/panel/islemler/tanimlamalar");
  return { success: true, message: "İşlem tanımı güncellendi." };
}

export async function islemAdimiSablonuAktifDurumDegistir(sablonId: string, yeniDurum: boolean) {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return;
  }

  const { error } = await supabase
    .from("islem_adimi_sablonu")
    .update({ aktif: yeniDurum })
    .eq("id", sablonId);

  if (error) {
    console.error("İşlem tanımlama durumu güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/islemler");
  revalidatePath("/panel/islemler/tanimlamalar");
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

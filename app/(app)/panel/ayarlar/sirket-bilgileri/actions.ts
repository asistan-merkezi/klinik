"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isimBasHarfBuyukYap } from "@/lib/utils";

type SonucDurumu = { success: boolean; message: string } | null;

const IZINLI_LOGO_TIPLERI: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

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

const sirketSemasi = z.object({
  ad: z.string().trim().min(1, "Şirket adı gerekli."),
  unvan: z.string().nullable(),
  il: z.string().nullable(),
  ilce: z.string().nullable(),
  mahalle: z.string().nullable(),
  adres: z.string().nullable(),
  vergi_dairesi: z.string().nullable(),
  vergi_no: z.string().nullable(),
  telefon: z.string().nullable(),
  whatsapp_no: z.string().nullable(),
  eposta: z.string().email("Geçersiz e-posta.").nullable(),
  yetkili_kisi: z.string().nullable(),
  yetkili_telefon: z.string().nullable(),
  yetkili_eposta: z.string().email("Geçersiz yetkili e-postası.").nullable(),
  hafta_ici_baslangic: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  hafta_ici_bitis: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  cumartesi_baslangic: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  cumartesi_bitis: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  pazar_baslangic: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
  pazar_bitis: z.string().regex(/^\d{2}:\d{2}$/, "Geçersiz saat.").nullable(),
});

export async function sirketBilgileriGuncelle(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = sirketSemasi.safeParse({
    ad: formData.get("ad"),
    unvan: bosIseNull(formData.get("unvan")),
    il: bosIseNull(formData.get("adres_il")),
    ilce: bosIseNull(formData.get("adres_ilce")),
    mahalle: bosIseNull(formData.get("adres_mahalle")),
    adres: bosIseNull(formData.get("adres")),
    vergi_dairesi: bosIseNull(formData.get("vergi_dairesi")),
    vergi_no: bosIseNull(formData.get("vergi_no")),
    telefon: bosIseNull(formData.get("telefon")),
    whatsapp_no: bosIseNull(formData.get("whatsapp_no")),
    eposta: bosIseNull(formData.get("eposta")),
    yetkili_kisi: bosIseNull(formData.get("yetkili_kisi")),
    yetkili_telefon: bosIseNull(formData.get("yetkili_telefon")),
    yetkili_eposta: bosIseNull(formData.get("yetkili_eposta")),
    hafta_ici_baslangic: bosIseNull(formData.get("hafta_ici_baslangic")),
    hafta_ici_bitis: bosIseNull(formData.get("hafta_ici_bitis")),
    cumartesi_baslangic: bosIseNull(formData.get("cumartesi_baslangic")),
    cumartesi_bitis: bosIseNull(formData.get("cumartesi_bitis")),
    pazar_baslangic: bosIseNull(formData.get("pazar_baslangic")),
    pazar_bitis: bosIseNull(formData.get("pazar_bitis")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const guncellenecek: Record<string, string | null> = {
    ...ayristirma.data,
    ad: isimBasHarfBuyukYap(ayristirma.data.ad),
    unvan: ayristirma.data.unvan ? isimBasHarfBuyukYap(ayristirma.data.unvan) : null,
    vergi_dairesi: ayristirma.data.vergi_dairesi ? isimBasHarfBuyukYap(ayristirma.data.vergi_dairesi) : null,
    yetkili_kisi: ayristirma.data.yetkili_kisi ? isimBasHarfBuyukYap(ayristirma.data.yetkili_kisi) : null,
  };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const uzanti = IZINLI_LOGO_TIPLERI[logo.type];
    if (!uzanti) {
      return { success: false, message: "Logo PNG, JPG, WEBP veya SVG olmalı." };
    }

    const yol = `${klinikId}/logo.${uzanti}`;
    const { error: yuklemeHatasi } = await supabase.storage
      .from("klinik-logo")
      .upload(yol, logo, { upsert: true, contentType: logo.type });

    if (yuklemeHatasi) {
      console.error("Logo yüklenemedi:", yuklemeHatasi);
      return { success: false, message: "Logo yüklenemedi, lütfen tekrar deneyin." };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("klinik-logo").getPublicUrl(yol);
    // Public URL değişmeden kalabildiği için (upsert aynı ada yazıyor) tarayıcı
    // önbelleğini atlatmak amacıyla bir sürüm parametresi eklenir.
    guncellenecek.logo_url = `${publicUrl}?v=${Date.now()}`;
  }

  const { error } = await supabase.from("klinik").update(guncellenecek).eq("id", klinikId);

  if (error) {
    console.error("Şirket bilgileri güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return { success: true, message: "Şirket bilgileri kaydedildi." };
}

const aracSemasi = z.object({
  marka: z.string().trim().min(1, "Marka gerekli."),
  model: z.string().trim().min(1, "Model gerekli."),
  plaka: z.string().trim().min(1, "Plaka gerekli."),
});

export async function aracEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = aracSemasi.safeParse({
    marka: formData.get("marka"),
    model: formData.get("model"),
    plaka: formData.get("plaka"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("klinik_arac").insert({
    klinik_id: klinikId,
    marka: ayristirma.data.marka,
    model: ayristirma.data.model,
    plaka: ayristirma.data.plaka,
    olusturan_kullanici_id: user?.id ?? null,
  });

  if (error) {
    console.error("Araç eklenemedi:", error);
    return { success: false, message: "Araç eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return { success: true, message: "Araç eklendi." };
}

export async function aracSil(id: string): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.from("klinik_arac").delete().eq("id", id).eq("klinik_id", klinikId);

  if (error) {
    console.error("Araç silinemedi:", error);
    return { success: false, message: "Araç silinemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/sirket-bilgileri");
  return { success: true, message: "Araç silindi." };
}

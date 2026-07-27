"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

const IZINLI_LOGO_TIPLERI: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const MAKS_LOGO_BOYUTU = 2 * 1024 * 1024; // 2 MB

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
  unvan: z.string().nullable(),
  adres: z.string().nullable(),
  vergi_dairesi: z.string().nullable(),
  vergi_no: z.string().nullable(),
  telefon: z.string().nullable(),
  whatsapp_no: z.string().nullable(),
  eposta: z.string().email("Geçersiz e-posta.").nullable(),
  yetkili_kisi: z.string().nullable(),
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
    unvan: bosIseNull(formData.get("unvan")),
    adres: bosIseNull(formData.get("adres")),
    vergi_dairesi: bosIseNull(formData.get("vergi_dairesi")),
    vergi_no: bosIseNull(formData.get("vergi_no")),
    telefon: bosIseNull(formData.get("telefon")),
    whatsapp_no: bosIseNull(formData.get("whatsapp_no")),
    eposta: bosIseNull(formData.get("eposta")),
    yetkili_kisi: bosIseNull(formData.get("yetkili_kisi")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const guncellenecek: Record<string, string | null> = { ...ayristirma.data };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > MAKS_LOGO_BOYUTU) {
      return { success: false, message: "Logo en fazla 2 MB olabilir." };
    }
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

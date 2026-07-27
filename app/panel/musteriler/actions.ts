"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

const telefonSemasi = z
  .string()
  .trim()
  .min(7, "Telefon numarası geçersiz.")
  .max(20, "Telefon numarası geçersiz.")
  .regex(/^[0-9+ ]+$/, "Telefon sadece rakam, boşluk ve + içerebilir.");

const musteriSemasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  telefon: telefonSemasi,
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  whatsapp_izin_durumu: z.coerce.boolean().optional(),
});

const kimlikOlusturSemasi = z.object({
  kimlik_no: z.string().trim().optional(),
  kimlik_no_tipi: z.enum(["tc", "pasaport"]).optional(),
  ticari_ileti_onay: z.coerce.boolean().optional(),
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

export async function musteriOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();

  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = musteriSemasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    whatsapp_izin_durumu: formData.get("whatsapp_izin_durumu") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const kimlikAyristirma = kimlikOlusturSemasi.safeParse({
    kimlik_no: formData.get("kimlik_no") ?? "",
    kimlik_no_tipi: formData.get("kimlik_no_tipi") || undefined,
    ticari_ileti_onay: formData.get("ticari_ileti_onay") === "on",
  });

  if (!kimlikAyristirma.success) {
    return { success: false, message: kimlikAyristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad_soyad, telefon, dogum_tarihi, whatsapp_izin_durumu } = ayristirma.data;
  const { kimlik_no, kimlik_no_tipi, ticari_ileti_onay } = kimlikAyristirma.data;

  const { data: yeniMusteri, error } = await supabase
    .from("musteri")
    .insert({
      klinik_id: klinikId,
      ad_soyad,
      telefon,
      dogum_tarihi: dogum_tarihi ? dogum_tarihi : null,
      whatsapp_izin_durumu: whatsapp_izin_durumu ?? false,
      ticari_ileti_onay_tarihi: ticari_ileti_onay ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !yeniMusteri) {
    console.error("Müşteri oluşturulamadı:", error);
    return { success: false, message: "Müşteri oluşturulamadı, lütfen tekrar deneyin." };
  }

  if (kimlik_no) {
    const { error: hassasError } = await supabase.from("musteri_hassas").insert({
      musteri_id: yeniMusteri.id,
      kimlik_no,
      kimlik_no_tipi: kimlik_no_tipi ?? "tc",
    });
    if (hassasError) {
      console.error("Kimlik bilgisi kaydedilemedi:", hassasError);
      revalidatePath("/panel/musteriler");
      return {
        success: true,
        message:
          hassasError.code === "23505"
            ? "Müşteri kaydedildi ama bu kimlik no başka bir müşteride kayıtlı, kimlik bilgisi eklenemedi."
            : "Müşteri kaydedildi ama kimlik bilgisi eklenemedi, Müşteri Detay'dan tekrar deneyin.",
      };
    }
  }

  revalidatePath("/panel/musteriler");
  return { success: true, message: "Müşteri kaydedildi." };
}

export async function musteriGuncelle(
  musteriId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();

  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = musteriSemasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    whatsapp_izin_durumu: formData.get("whatsapp_izin_durumu") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad_soyad, telefon, dogum_tarihi, whatsapp_izin_durumu } = ayristirma.data;

  const { error } = await supabase
    .from("musteri")
    .update({
      ad_soyad,
      telefon,
      dogum_tarihi: dogum_tarihi ? dogum_tarihi : null,
      whatsapp_izin_durumu: whatsapp_izin_durumu ?? false,
    })
    .eq("id", musteriId);

  if (error) {
    console.error("Müşteri güncellenemedi:", error);
    return { success: false, message: "Müşteri güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/musteriler");
  revalidatePath("/panel/randevular");
  return { success: true, message: "Müşteri güncellendi." };
}

export async function kvkkOnayVer(musteriId: string) {
  const { supabase, klinikId } = await klinikIdGetir();

  if (!klinikId) {
    return;
  }

  const { error } = await supabase
    .from("musteri")
    .update({ kvkk_onay_tarihi: new Date().toISOString() })
    .eq("id", musteriId);

  if (error) {
    console.error("KVKK onayı kaydedilemedi:", error);
    return;
  }

  revalidatePath("/panel/musteriler");
}

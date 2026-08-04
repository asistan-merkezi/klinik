"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { revalidateHastaDetay } from "./[id]/revalidate";

type SonucDurumu = { success: boolean; message: string } | null;

const telefonSemasi = z
  .string()
  .trim()
  .min(7, "Telefon numarası geçersiz.")
  .max(20, "Telefon numarası geçersiz.")
  .regex(/^[0-9+ ]+$/, "Telefon sadece rakam, boşluk ve + içerebilir.");

const hastaSemasi = z.object({
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

  return { supabase, klinikId: kullanici?.klinik_id ?? null, userId: user.id };
}

export async function hastaOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();

  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = hastaSemasi.safeParse({
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

  if (kimlik_no) {
    const { data: mevcutKimlik } = await supabase
      .from("hasta_hassas")
      .select("hasta_id")
      .eq("klinik_id", klinikId)
      .eq("kimlik_no", kimlik_no)
      .maybeSingle();

    if (mevcutKimlik) {
      return { success: false, message: "Bu kimlik numarasına sahip bir hasta zaten kayıtlı." };
    }
  }

  const { data: yeniHasta, error } = await supabase
    .from("hasta")
    .insert({
      klinik_id: klinikId,
      ad_soyad: isimBasHarfBuyukYap(ad_soyad),
      telefon,
      dogum_tarihi: dogum_tarihi ? dogum_tarihi : null,
      whatsapp_izin_durumu: whatsapp_izin_durumu ?? false,
      ticari_ileti_onay_tarihi: ticari_ileti_onay ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !yeniHasta) {
    console.error("Hasta oluşturulamadı:", error);
    return { success: false, message: "Hasta oluşturulamadı, lütfen tekrar deneyin." };
  }

  if (kimlik_no) {
    const { error: hassasError } = await supabase.from("hasta_hassas").insert({
      hasta_id: yeniHasta.id,
      kimlik_no,
      kimlik_no_tipi: kimlik_no_tipi ?? "tc",
    });
    if (hassasError) {
      // Ön kontrole rağmen eşzamanlı kayıt yüzünden yine de çakıştıysa, yarım kalmış
      // (kimliksiz) hasta kaydını bırakmamak için oluşturulan hasta satırı geri alınır.
      await supabase.from("hasta").delete().eq("id", yeniHasta.id);
      console.error("Kimlik bilgisi kaydedilemedi:", hassasError);
      return {
        success: false,
        message:
          hassasError.code === "23505"
            ? "Bu kimlik numarasına sahip bir hasta zaten kayıtlı."
            : "Hasta oluşturulamadı, lütfen tekrar deneyin.",
      };
    }
  }

  revalidatePath("/panel/hastalar");
  return { success: true, message: "Hasta kaydedildi." };
}

export async function hastaGuncelle(
  hastaId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();

  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = hastaSemasi.safeParse({
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
    .from("hasta")
    .update({
      ad_soyad: isimBasHarfBuyukYap(ad_soyad),
      telefon,
      dogum_tarihi: dogum_tarihi ? dogum_tarihi : null,
      whatsapp_izin_durumu: whatsapp_izin_durumu ?? false,
    })
    .eq("id", hastaId);

  if (error) {
    console.error("Hasta güncellenemedi:", error);
    return { success: false, message: "Hasta güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/hastalar");
  revalidateHastaDetay(hastaId);
  revalidatePath("/panel/randevular");
  return { success: true, message: "Hasta güncellendi." };
}

export async function kvkkOnayVer(hastaId: string): Promise<SonucDurumu> {
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

  if (!kullanici?.klinik_id || (kullanici.rol !== "klinik_admin" && kullanici.rol !== "resepsiyon")) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase
    .from("hasta")
    .update({
      kvkk_onay_tarihi: new Date().toISOString(),
      kvkk_onaylayan_tip: "personel",
      kvkk_onaylayan_kullanici_id: user.id,
    })
    .eq("id", hastaId);

  if (error) {
    console.error("KVKK onayı kaydedilemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/hastalar");
  revalidateHastaDetay(hastaId);
  return { success: true, message: "KVKK onayı kaydedildi." };
}

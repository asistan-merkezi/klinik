"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

const paketSemasi = z.object({
  ad: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  islem_tanimi_id: z.string().uuid("İşlem tanımı seçilmeli."),
  seans_sayisi: z.coerce.number().int("Seans sayısı tam sayı olmalı.").min(1, "Seans sayısı en az 1 olmalı."),
  gecerlilik_gun: z.coerce.number().int("Geçerlilik gün tam sayı olmalı.").min(1, "Geçerlilik en az 1 gün olmalı."),
  fiyat: z.coerce.number().min(0, "Fiyat 0'dan küçük olamaz."),
  kdv_orani: z.coerce.number().min(0, "KDV 0-100 arasında olmalı.").max(100, "KDV 0-100 arasında olmalı."),
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
  return paketSemasi.safeParse({
    ad: formData.get("ad"),
    islem_tanimi_id: formData.get("islem_tanimi_id"),
    seans_sayisi: formData.get("seans_sayisi"),
    gecerlilik_gun: formData.get("gecerlilik_gun"),
    fiyat: formData.get("fiyat"),
    kdv_orani: formData.get("kdv_orani"),
  });
}

export async function paketOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = ayristir(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad, islem_tanimi_id, seans_sayisi, gecerlilik_gun, fiyat, kdv_orani } = ayristirma.data;

  const { error } = await supabase.from("paket").insert({
    klinik_id: klinikId,
    ad,
    islem_tanimi_id,
    seans_sayisi,
    gecerlilik_gun,
    fiyat,
    kdv_orani,
  });

  if (error) {
    console.error("Paket oluşturulamadı:", error);
    if (error.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "Paket eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/paketler");
  return { success: true, message: "Paket eklendi." };
}

export async function paketGuncelle(
  paketId: string,
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

  const { ad, islem_tanimi_id, seans_sayisi, gecerlilik_gun, fiyat, kdv_orani } = ayristirma.data;

  const { error } = await supabase
    .from("paket")
    .update({
      ad,
      islem_tanimi_id,
      seans_sayisi,
      gecerlilik_gun,
      fiyat,
      kdv_orani,
    })
    .eq("id", paketId);

  if (error) {
    console.error("Paket güncellenemedi:", error);
    if (error.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "Paket güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/paketler");
  return { success: true, message: "Paket güncellendi." };
}

export async function paketAktifDurumDegistir(paketId: string, yeniDurum: boolean) {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return;
  }

  const { error } = await supabase.from("paket").update({ aktif: yeniDurum }).eq("id", paketId);

  if (error) {
    console.error("Paket durumu güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/paketler");
}

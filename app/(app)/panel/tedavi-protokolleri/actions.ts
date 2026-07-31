"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

const adimSemasi = z.object({
  islem_tanimi_id: z.string().uuid(),
  not: z.string(),
});

const protokolSemasi = z.object({
  ad: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  aciklama: z.string().trim().optional(),
  adimlar: z.array(adimSemasi).min(1, "En az bir tedavi adımı ekleyin."),
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
  let adimlar: unknown = [];
  try {
    adimlar = JSON.parse((formData.get("adimlar_json") as string | null) ?? "[]");
  } catch {
    adimlar = [];
  }

  return protokolSemasi.safeParse({
    ad: formData.get("ad"),
    aciklama: formData.get("aciklama") ?? "",
    adimlar,
  });
}

export async function tedaviProtokoluOlustur(
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

  const { ad, aciklama, adimlar } = ayristirma.data;

  const { data: protokol, error } = await supabase
    .from("tedavi_protokolu")
    .insert({
      klinik_id: klinikId,
      ad,
      aciklama: aciklama ? aciklama : null,
    })
    .select("id")
    .single();

  if (error || !protokol) {
    console.error("Tedavi protokolü oluşturulamadı:", error);
    if (error?.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "Tedavi protokolü eklenemedi, lütfen tekrar deneyin." };
  }

  const adimSatirlari = adimlar.map((adim, index) => ({
    tedavi_protokolu_id: protokol.id,
    islem_tanimi_id: adim.islem_tanimi_id,
    sira: index + 1,
    adim_notu: adim.not.trim() ? adim.not.trim() : null,
  }));

  const { error: adimHatasi } = await supabase.from("tedavi_protokolu_adimi").insert(adimSatirlari);

  if (adimHatasi) {
    console.error("Protokol adımları eklenemedi:", adimHatasi);
    await supabase.from("tedavi_protokolu").delete().eq("id", protokol.id);
    return { success: false, message: "Protokol adımları eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/tedavi-protokolleri");
  return { success: true, message: "Tedavi protokolü eklendi." };
}

export async function tedaviProtokoluGuncelle(
  protokolId: string,
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

  const { ad, aciklama, adimlar } = ayristirma.data;

  const { error } = await supabase
    .from("tedavi_protokolu")
    .update({ ad, aciklama: aciklama ? aciklama : null })
    .eq("id", protokolId);

  if (error) {
    console.error("Tedavi protokolü güncellenemedi:", error);
    if (error.code === "42501") {
      return { success: false, message: "Bu işlem için yetkiniz yok." };
    }
    return { success: false, message: "Tedavi protokolü güncellenemedi, lütfen tekrar deneyin." };
  }

  const { error: silmeHatasi } = await supabase
    .from("tedavi_protokolu_adimi")
    .delete()
    .eq("tedavi_protokolu_id", protokolId);

  if (silmeHatasi) {
    console.error("Protokol adımları güncellenemedi (silme):", silmeHatasi);
    return { success: false, message: "Protokol adımları güncellenemedi, lütfen tekrar deneyin." };
  }

  const adimSatirlari = adimlar.map((adim, index) => ({
    tedavi_protokolu_id: protokolId,
    islem_tanimi_id: adim.islem_tanimi_id,
    sira: index + 1,
    adim_notu: adim.not.trim() ? adim.not.trim() : null,
  }));

  const { error: adimHatasi } = await supabase.from("tedavi_protokolu_adimi").insert(adimSatirlari);

  if (adimHatasi) {
    console.error("Protokol adımları güncellenemedi (ekleme):", adimHatasi);
    return { success: false, message: "Protokol adımları güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/tedavi-protokolleri");
  return { success: true, message: "Tedavi protokolü güncellendi." };
}

export async function tedaviProtokoluAktifDurumDegistir(protokolId: string, yeniDurum: boolean) {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return;
  }

  const { error } = await supabase
    .from("tedavi_protokolu")
    .update({ aktif: yeniDurum })
    .eq("id", protokolId);

  if (error) {
    console.error("Tedavi protokolü durumu güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/tedavi-protokolleri");
}

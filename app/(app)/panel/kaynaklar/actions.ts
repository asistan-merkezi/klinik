"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isimBasHarfBuyukYap } from "@/lib/utils";

type SonucDurumu = { success: boolean; message: string } | null;

const tabloSemasi = z.enum(["oda", "cihaz"]);
export type KaynakTablosu = z.infer<typeof tabloSemasi>;

const ETIKET: Record<KaynakTablosu, string> = {
  oda: "Oda",
  cihaz: "Cihaz",
};

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

export async function kaynakOlustur(
  tablo: KaynakTablosu,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const gecerliTablo = tabloSemasi.safeParse(tablo);
  if (!gecerliTablo.success) {
    return { success: false, message: "Geçersiz kaynak türü." };
  }

  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const adSemasi = z.string().trim().min(2, "Ad en az 2 karakter olmalı.");
  const ayristirma = adSemasi.safeParse(formData.get("ad"));
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const kayit: { klinik_id: string; ad: string; adet?: number; kapasite?: number } = {
    klinik_id: klinikId,
    ad: isimBasHarfBuyukYap(ayristirma.data),
  };

  if (gecerliTablo.data === "cihaz") {
    const adetSemasi = z.coerce.number().int().min(1, "Adet en az 1 olmalı.");
    const adetAyristirma = adetSemasi.safeParse(formData.get("adet") || 1);
    if (!adetAyristirma.success) {
      return { success: false, message: adetAyristirma.error.issues[0]?.message ?? "Girdi hatalı." };
    }
    kayit.adet = adetAyristirma.data;
  }

  if (gecerliTablo.data === "oda") {
    const kapasiteSemasi = z.coerce.number().int().min(1, "Kapasite en az 1 olmalı.");
    const kapasiteAyristirma = kapasiteSemasi.safeParse(formData.get("kapasite") || 1);
    if (!kapasiteAyristirma.success) {
      return { success: false, message: kapasiteAyristirma.error.issues[0]?.message ?? "Girdi hatalı." };
    }
    kayit.kapasite = kapasiteAyristirma.data;
  }

  const { error } = await supabase.from(gecerliTablo.data).insert(kayit);

  if (error) {
    console.error(`${gecerliTablo.data} oluşturulamadı:`, error);
    return { success: false, message: `${ETIKET[gecerliTablo.data]} eklenemedi, lütfen tekrar deneyin.` };
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
  return { success: true, message: `${ETIKET[gecerliTablo.data]} eklendi.` };
}

export async function kaynakAdGuncelle(
  tablo: KaynakTablosu,
  kaynakId: string,
  yeniAd: string
): Promise<SonucDurumu> {
  const gecerliTablo = tabloSemasi.safeParse(tablo);
  if (!gecerliTablo.success) {
    return { success: false, message: "Geçersiz kaynak türü." };
  }

  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const adSemasi = z.string().trim().min(2, "Ad en az 2 karakter olmalı.");
  const ayristirma = adSemasi.safeParse(yeniAd);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase
    .from(gecerliTablo.data)
    .update({ ad: isimBasHarfBuyukYap(ayristirma.data) })
    .eq("id", kaynakId);

  if (error) {
    console.error(`${gecerliTablo.data} adı güncellenemedi:`, error);
    return { success: false, message: `${ETIKET[gecerliTablo.data]} adı güncellenemedi, lütfen tekrar deneyin.` };
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
  return { success: true, message: `${ETIKET[gecerliTablo.data]} adı güncellendi.` };
}

export async function kaynakAdetGuncelle(kaynakId: string, yeniAdet: number) {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return;
  }

  const adetSemasi = z.coerce.number().int().min(1);
  const ayristirma = adetSemasi.safeParse(yeniAdet);
  if (!ayristirma.success) {
    return;
  }

  const { error } = await supabase.from("cihaz").update({ adet: ayristirma.data }).eq("id", kaynakId);

  if (error) {
    console.error("Cihaz adedi güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
}

export async function kaynakKapasiteGuncelle(kaynakId: string, yeniKapasite: number) {
  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return;
  }

  const kapasiteSemasi = z.coerce.number().int().min(1);
  const ayristirma = kapasiteSemasi.safeParse(yeniKapasite);
  if (!ayristirma.success) {
    return;
  }

  const { error } = await supabase.from("oda").update({ kapasite: ayristirma.data }).eq("id", kaynakId);

  if (error) {
    console.error("Oda kapasitesi güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
}

export async function kaynakAktifDurumDegistir(
  tablo: KaynakTablosu,
  kaynakId: string,
  yeniDurum: boolean
) {
  const gecerliTablo = tabloSemasi.safeParse(tablo);
  if (!gecerliTablo.success) {
    return;
  }

  const { supabase, klinikId } = await klinikIdGetir();
  if (!klinikId) {
    return;
  }

  const { error } = await supabase
    .from(gecerliTablo.data)
    .update({ aktif: yeniDurum })
    .eq("id", kaynakId);

  if (error) {
    console.error(`${gecerliTablo.data} durumu güncellenemedi:`, error);
    return;
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
}

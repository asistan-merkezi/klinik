"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { RandevuDurum } from "@/types/randevu";

type SonucDurumu = { success: boolean; message: string } | null;

const randevuSemasi = z.object({
  musteri_id: z.string().uuid("Müşteri seçilmeli."),
  terapist_id: z.string().uuid("Terapist seçilmeli."),
  oda_id: z.string().uuid("Oda seçilmeli."),
  cihaz_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  tarih: z.string().min(1, "Tarih gerekli."),
  saat: z.string().min(1, "Saat gerekli."),
  sure_dakika: z.coerce.number().int().min(5, "Süre en az 5 dakika olmalı.").max(480, "Süre en fazla 480 dakika olabilir."),
});

export async function randevuOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
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

  if (!kullanici?.klinik_id) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

  const ayristirma = randevuSemasi.safeParse({
    musteri_id: formData.get("musteri_id"),
    terapist_id: formData.get("terapist_id"),
    oda_id: formData.get("oda_id"),
    cihaz_id: formData.get("cihaz_id") ?? "",
    tarih: formData.get("tarih"),
    saat: formData.get("saat"),
    sure_dakika: formData.get("sure_dakika"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { musteri_id, terapist_id, oda_id, cihaz_id, tarih, saat, sure_dakika } = ayristirma.data;

  const baslangic = new Date(`${tarih}T${saat}:00`);
  if (Number.isNaN(baslangic.getTime())) {
    return { success: false, message: "Tarih/saat geçersiz." };
  }
  const bitis = new Date(baslangic.getTime() + sure_dakika * 60_000);

  const { error } = await supabase.from("randevu").insert({
    klinik_id: kullanici.klinik_id,
    musteri_id,
    terapist_id,
    oda_id,
    cihaz_id: cihaz_id ? cihaz_id : null,
    baslangic: baslangic.toISOString(),
    bitis: bitis.toISOString(),
    olusturan_kullanici_id: user.id,
  });

  if (error) {
    console.error("Randevu oluşturulamadı:", error);
    if (error.code === "23P01") {
      return {
        success: false,
        message: "Seçilen terapist, oda veya cihaz bu saatte dolu.",
      };
    }
    return { success: false, message: "Randevu oluşturulamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { success: true, message: "Randevu oluşturuldu." };
}

export async function randevuGuncelle(
  randevuId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const ayristirma = randevuSemasi.safeParse({
    musteri_id: formData.get("musteri_id"),
    terapist_id: formData.get("terapist_id"),
    oda_id: formData.get("oda_id"),
    cihaz_id: formData.get("cihaz_id") ?? "",
    tarih: formData.get("tarih"),
    saat: formData.get("saat"),
    sure_dakika: formData.get("sure_dakika"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { musteri_id, terapist_id, oda_id, cihaz_id, tarih, saat, sure_dakika } = ayristirma.data;

  const baslangic = new Date(`${tarih}T${saat}:00`);
  if (Number.isNaN(baslangic.getTime())) {
    return { success: false, message: "Tarih/saat geçersiz." };
  }
  const bitis = new Date(baslangic.getTime() + sure_dakika * 60_000);

  const { error } = await supabase
    .from("randevu")
    .update({
      musteri_id,
      terapist_id,
      oda_id,
      cihaz_id: cihaz_id ? cihaz_id : null,
      baslangic: baslangic.toISOString(),
      bitis: bitis.toISOString(),
    })
    .eq("id", randevuId);

  if (error) {
    console.error("Randevu güncellenemedi:", error);
    if (error.code === "23P01") {
      return {
        success: false,
        message: "Seçilen terapist, oda veya cihaz bu saatte dolu.",
      };
    }
    return { success: false, message: "Randevu güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { success: true, message: "Randevu güncellendi." };
}

const durumSemasi = z.enum(["planlandi", "geldi", "iptal", "gelmedi"]);

export async function randevuDurumGuncelle(randevuId: string, yeniDurum: RandevuDurum) {
  const gecerliDurum = durumSemasi.safeParse(yeniDurum);
  if (!gecerliDurum.success) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { error } = await supabase
    .from("randevu")
    .update({ durum: gecerliDurum.data })
    .eq("id", randevuId);

  if (error) {
    console.error("Randevu durumu güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
}

type SonucDurumu2 = { success: boolean; message: string } | null;

export async function iptalTalebiOnayla(talepId: string, randevuId: string): Promise<SonucDurumu2> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const [randevuSonucu, talepSonucu] = await Promise.all([
    supabase.from("randevu").update({ durum: "iptal" }).eq("id", randevuId),
    supabase
      .from("randevu_iptal_talebi")
      .update({ durum: "onaylandi", yanit_kullanici_id: user.id, yanit_tarihi: new Date().toISOString() })
      .eq("id", talepId),
  ]);

  if (randevuSonucu.error || talepSonucu.error) {
    console.error("İptal talebi onaylanamadı:", randevuSonucu.error, talepSonucu.error);
    return { success: false, message: "İptal talebi onaylanamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { success: true, message: "Randevu iptal edildi." };
}

export async function iptalTalebiReddet(talepId: string): Promise<SonucDurumu2> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { error } = await supabase
    .from("randevu_iptal_talebi")
    .update({ durum: "reddedildi", yanit_kullanici_id: user.id, yanit_tarihi: new Date().toISOString() })
    .eq("id", talepId);

  if (error) {
    console.error("İptal talebi reddedilemedi:", error);
    return { success: false, message: "İşlem başarısız, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  return { success: true, message: "İptal talebi reddedildi." };
}

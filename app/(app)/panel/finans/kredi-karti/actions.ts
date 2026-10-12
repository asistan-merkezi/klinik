"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { finansSayfalariniYenile } from "@/lib/finans/sayfa-yenile";

type SonucDurumu = { success: boolean; message: string } | null;

const kartOdemeSemasi = z.object({
  kredi_karti_id: z.string().trim().min(1, "Kredi kartı seçilmeli."),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  odeme_tipi: z.enum(["nakit", "havale"], { message: "Ödeme yeri (Kasa/Banka) seçilmeli." }),
  banka_hesap_id: z.string().trim().optional(),
  aciklama: z.string().trim().optional(),
});

async function adminBaglantiGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();
  if (!kullanici?.klinik_id || kullanici.rol !== "klinik_admin") return null;
  return { supabase, userId: user.id, klinikId: kullanici.klinik_id };
}

/**
 * Şirket kredi kartına ödeme: Kasa'dan (nakit) ya da Banka'dan (havale) ÇIKIŞ olur ve kart borcunu düşürür.
 * Raporlar'da gider SAYILMAZ (harcama kartla yapıldığı anda gider sayılmıştı, çift sayım olmasın).
 */
export async function krediKartiOdemeEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const baglanti = await adminBaglantiGetir();
  if (!baglanti) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  const ayristirma = kartOdemeSemasi.safeParse({
    kredi_karti_id: formData.get("kredi_karti_id") ?? "",
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    odeme_tipi: formData.get("odeme_tipi"),
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const veri = ayristirma.data;
  const { supabase, userId, klinikId } = baglanti;

  const { data: kart } = await supabase
    .from("klinik_kredi_kartlari")
    .select("id")
    .eq("id", veri.kredi_karti_id)
    .eq("klinik_id", klinikId)
    .maybeSingle();
  if (!kart) {
    return { success: false, message: "Seçilen kredi kartı bulunamadı." };
  }

  if (veri.odeme_tipi === "havale") {
    if (!veri.banka_hesap_id) {
      return { success: false, message: "Havale için banka hesabı seçilmeli." };
    }
    const { data: hesap } = await supabase
      .from("klinik_banka_hesaplari")
      .select("id")
      .eq("id", veri.banka_hesap_id)
      .eq("klinik_id", klinikId)
      .maybeSingle();
    if (!hesap) {
      return { success: false, message: "Seçilen banka hesabı bulunamadı." };
    }
  }

  const { error } = await supabase.from("klinik_kredi_karti_odeme").insert({
    klinik_id: klinikId,
    kredi_karti_id: veri.kredi_karti_id,
    tutar: veri.tutar,
    tarih: veri.tarih,
    odeme_tipi: veri.odeme_tipi,
    banka_hesap_id: veri.odeme_tipi === "havale" ? veri.banka_hesap_id : null,
    aciklama: veri.aciklama ? veri.aciklama : null,
    olusturan_kullanici_id: userId,
  });
  if (error) {
    console.error("Kart ödemesi kaydedilemedi:", error);
    return { success: false, message: "Kart ödemesi kaydedilemedi, lütfen tekrar deneyin." };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Kart ödemesi kaydedildi." };
}

export async function krediKartiOdemeSil(id: string): Promise<SonucDurumu> {
  const baglanti = await adminBaglantiGetir();
  if (!baglanti) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  const { error } = await baglanti.supabase
    .from("klinik_kredi_karti_odeme")
    .delete()
    .eq("id", id)
    .eq("klinik_id", baglanti.klinikId);
  if (error) {
    console.error("Kart ödemesi silinemedi:", error);
    return { success: false, message: "Kart ödemesi silinemedi, lütfen tekrar deneyin." };
  }
  finansSayfalariniYenile();
  return { success: true, message: "Kart ödemesi silindi." };
}

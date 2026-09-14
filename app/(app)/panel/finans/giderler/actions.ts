"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ARAC_GOSTERILEN_KATEGORILER, type HarcamaKategori, type OdemeTipi } from "@/types/klinik-harcama";

type SonucDurumu = { success: boolean; message: string } | null;

const ODEME_TIPLERI: OdemeTipi[] = ["nakit", "havale", "kredi_karti"];

// Migration 20260914090000'daki klinik_harcama.kategori CHECK'iyle birebir aynı liste.
const harcamaSemasi = z.object({
  tarih: z.string().min(1, "Tarih seçilmeli."),
  kategori: z.enum(["kira", "fatura", "malzeme", "bakim_hizmet", "diger"]),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tedarikci_adi: z.string().trim().optional(),
  arac_id: z.string().trim().optional(),
  odeme_tipi: z.string().trim().optional(),
  banka_hesap_id: z.string().trim().optional(),
  aciklama: z.string().trim().optional(),
  is_faturali: z.string().optional(),
  fatura_no: z.string().trim().optional(),
});

async function yetkiliBaglantiGetir() {
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

  return { supabase, user, klinikId: kullanici?.klinik_id ?? null, rol: kullanici?.rol ?? null };
}

function formVerisiOku(formData: FormData) {
  return harcamaSemasi.safeParse({
    tarih: formData.get("tarih"),
    kategori: formData.get("kategori"),
    tutar: formData.get("tutar"),
    tedarikci_adi: formData.get("tedarikci_adi") ?? "",
    arac_id: formData.get("arac_id") ?? "",
    odeme_tipi: formData.get("odeme_tipi") ?? "",
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
    aciklama: formData.get("aciklama") ?? "",
    is_faturali: formData.get("is_faturali") ?? "",
    fatura_no: formData.get("fatura_no") ?? "",
  });
}

/** Kategoriye göre araç, ödeme tipine göre banka hesabı zorunlu tutarlılığı — istemciden ne gelirse gelsin burada garanti edilir. */
function harcamaSatiriOlustur(veri: z.infer<typeof harcamaSemasi>) {
  const kategori = veri.kategori as HarcamaKategori;
  const odemeTipi = ODEME_TIPLERI.includes(veri.odeme_tipi as OdemeTipi) ? (veri.odeme_tipi as OdemeTipi) : null;
  const aracGosterilir = ARAC_GOSTERILEN_KATEGORILER.includes(kategori);
  const isFaturali = veri.is_faturali === "on" || veri.is_faturali === "true";

  return {
    tarih: veri.tarih,
    kategori,
    tutar: veri.tutar,
    tedarikci_adi: veri.tedarikci_adi ? veri.tedarikci_adi : null,
    arac_id: aracGosterilir && veri.arac_id ? veri.arac_id : null,
    odeme_tipi: odemeTipi,
    banka_hesap_id: odemeTipi === "havale" && veri.banka_hesap_id ? veri.banka_hesap_id : null,
    aciklama: veri.aciklama ? veri.aciklama : null,
    is_faturali: isFaturali,
    fatura_no: isFaturali && veri.fatura_no ? veri.fatura_no : null,
  };
}

export async function giderEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, user, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase.from("klinik_harcama").insert({
    klinik_id: klinikId,
    ...harcamaSatiriOlustur(ayristirma.data),
    olusturan_kullanici_id: user!.id,
  });

  if (error) {
    console.error("Gider kaydedilemedi:", error);
    return { success: false, message: "Gider kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/giderler");
  revalidatePath("/panel/finans/raporlar");
  return { success: true, message: "Gider kaydedildi." };
}

export async function giderGuncelle(
  id: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, rol } = await yetkiliBaglantiGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase
    .from("klinik_harcama")
    .update(harcamaSatiriOlustur(ayristirma.data))
    .eq("id", id);

  if (error) {
    console.error("Gider güncellenemedi:", error);
    return { success: false, message: "Gider güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/giderler");
  revalidatePath("/panel/finans/raporlar");
  return { success: true, message: "Gider güncellendi." };
}

export async function giderSil(id: string): Promise<SonucDurumu> {
  const { supabase, rol } = await yetkiliBaglantiGetir();
  if (rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase.from("klinik_harcama").delete().eq("id", id);

  if (error) {
    console.error("Gider silinemedi:", error);
    return { success: false, message: "Gider silinemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/finans/giderler");
  revalidatePath("/panel/finans/raporlar");
  return { success: true, message: "Gider silindi." };
}

"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tedarikciAnahtari } from "@/lib/finans/tedarikci-anahtari";
import { finansSayfalariniYenile } from "@/lib/finans/sayfa-yenile";
import { giderEkle } from "../actions";

type SonucDurumu = { success: boolean; message: string } | null;

/** klinik_cari_odeme_ekle RPC'sinin `raise exception` kodlarını kullanıcıya anlaşılır çevirir. */
function cariRpcHatasi(mesaj: string | undefined): string {
  if (!mesaj) return "Cari ödemesi kaydedilemedi, lütfen tekrar deneyin.";
  if (mesaj.includes("bakiye_asildi")) return "Ödeme tutarı tedarikçinin cari bakiyesini aşıyor.";
  if (mesaj.includes("yetkisiz")) return "Bu işlem için yetkiniz yok.";
  if (mesaj.includes("tedarikci_gerekli")) return "Tedarikçi seçilmeli.";
  if (mesaj.includes("tutar_gecersiz")) return "Tutar 0'dan büyük olmalı.";
  if (mesaj.includes("banka_hesabi_gerekli")) return "Havale için banka hesabı seçilmeli.";
  if (mesaj.includes("kart_bulunamadi")) return "Seçilen kredi kartı bulunamadı.";
  if (mesaj.includes("odeme_tipi_gecersiz")) return "Ödeme yöntemi seçilmeli.";
  return "Cari ödemesi kaydedilemedi, lütfen tekrar deneyin.";
}

const cariOdemeSemasi = z.object({
  tedarikci_adi: z.string().trim().min(1, "Tedarikçi seçilmeli."),
  tutar: z.coerce.number().positive("Tutar 0'dan büyük olmalı."),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  odeme_tipi: z.enum(["nakit", "havale", "kredi_karti"], { message: "Ödeme yöntemi seçilmeli." }),
  banka_hesap_id: z.string().trim().optional(),
  kredi_karti_id: z.string().trim().optional(),
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
  return { supabase, klinikId: kullanici?.klinik_id ?? null, rol: kullanici?.rol ?? null };
}

async function cariOdemeYaz(
  supabase: Awaited<ReturnType<typeof createClient>>,
  veri: z.infer<typeof cariOdemeSemasi>
): Promise<SonucDurumu> {
  const { error } = await supabase.rpc("klinik_cari_odeme_ekle", {
    p_tedarikci_adi: veri.tedarikci_adi,
    p_tutar: veri.tutar,
    p_tarih: veri.tarih,
    p_odeme_tipi: veri.odeme_tipi,
    p_banka_hesap_id: veri.odeme_tipi === "havale" && veri.banka_hesap_id ? veri.banka_hesap_id : null,
    p_kredi_karti_id: veri.odeme_tipi === "kredi_karti" && veri.kredi_karti_id ? veri.kredi_karti_id : null,
    p_aciklama: veri.aciklama ? veri.aciklama : null,
  });
  if (error) {
    console.error("Cari ödemesi kaydedilemedi:", error);
    return { success: false, message: cariRpcHatasi(error.message) };
  }
  finansSayfalariniYenile();
  return { success: true, message: "Cari ödemesi kaydedildi." };
}

function cariOdemeFormuOku(formData: FormData) {
  return cariOdemeSemasi.safeParse({
    tedarikci_adi: formData.get("tedarikci_adi") ?? "",
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    odeme_tipi: formData.get("odeme_tipi"),
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
    kredi_karti_id: formData.get("kredi_karti_id") ?? "",
    aciklama: formData.get("aciklama") ?? "",
  });
}

/** Tedarikçi Cari Paneli > Ödeme Ekle. Bakiyeyi aşan tutar RPC'de (tedarikçi bazlı kilitle) reddedilir. */
export async function cariOdemeEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const baglanti = await adminBaglantiGetir();
  if (!baglanti?.klinikId || baglanti.rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  const ayristirma = cariOdemeFormuOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  return cariOdemeYaz(baglanti.supabase, ayristirma.data);
}

/** Cari ödemesini siler (bakiye geri artar; Kasa/Banka/Kart borcundan da düşer). */
export async function cariOdemeSil(id: string): Promise<SonucDurumu> {
  const baglanti = await adminBaglantiGetir();
  if (!baglanti?.klinikId || baglanti.rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  const { error } = await baglanti.supabase
    .from("klinik_cari_odeme")
    .delete()
    .eq("id", id)
    .eq("klinik_id", baglanti.klinikId);
  if (error) {
    console.error("Cari ödemesi silinemedi:", error);
    return { success: false, message: "Cari ödemesi silinemedi, lütfen tekrar deneyin." };
  }
  finansSayfalariniYenile();
  return { success: true, message: "Cari ödemesi silindi." };
}

export type CariBakiyeBilgisi = { borc: number; odenen: number; bakiye: number };

/** Kasa/Banka "Tedarikçi" formunda yazılan ada göre cari bakiyeyi gösterir (yoksa null). */
export async function cariBakiyeGetir(tedarikciAdi: string): Promise<CariBakiyeBilgisi | null> {
  const baglanti = await adminBaglantiGetir();
  if (!baglanti?.klinikId || (baglanti.rol !== "klinik_admin" && baglanti.rol !== "muhasebe")) return null;
  const anahtar = tedarikciAnahtari(tedarikciAdi);
  if (!anahtar) return null;

  const { data, error } = await baglanti.supabase.rpc("klinik_cari_bakiyeler", {
    p_klinik_id: baglanti.klinikId,
    p_anahtar: anahtar,
  });
  const satirlar = data as { anahtar: string; borc: number; odenen: number }[] | null;
  if (error || !satirlar?.[0]) return null;
  const borc = Number(satirlar[0].borc);
  const odenen = Number(satirlar[0].odenen);
  return { borc, odenen, bakiye: Math.round((borc - odenen) * 100) / 100 };
}

/**
 * Kasa/Banka "Tedarikçi" çıkışı: "Bu ödeme cari borçtan düşsün" işaretliyse ödeme cari ödemesi olarak yazılır
 * (gider olarak DEĞİL — Raporlar'da çift gider sayılmaz); değilse eskisi gibi yeni gider kaydı.
 */
export async function tedarikciOdemesiEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  if (formData.get("cariden_dus") !== "on") {
    return giderEkle(_onceki, formData);
  }
  const baglanti = await adminBaglantiGetir();
  if (!baglanti?.klinikId || baglanti.rol !== "klinik_admin") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  const ayristirma = cariOdemeFormuOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  return cariOdemeYaz(baglanti.supabase, ayristirma.data);
}

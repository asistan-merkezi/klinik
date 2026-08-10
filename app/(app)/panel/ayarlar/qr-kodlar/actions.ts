"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { QrKodTipi } from "@/lib/qr/qr-kod-tanimlari";

type SonucDurumu = { success: boolean; message: string } | null;

const tipSemasi = z.enum(["hasta_on_kayit", "anket", "puantaj_giris", "puantaj_cikis"]);

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

/**
 * QR Kodları yönetim listesindeki aktif/pasif checkbox'ı — Tablet Görünümü
 * ayarlarındaki (tabletAyarlariGuncelle) read-modify-write deseniyle birebir
 * aynı: klinik_ayarlar.ayarlar tek bir jsonb kolonu, düz upsert diğer
 * anahtarları (tablet, vs.) silebileceği için önce mevcut değeri okuyup
 * üstüne "qr_kodlari" anahtarını yazıyoruz.
 */
export async function qrKoduDurumGuncelle(tip: QrKodTipi, aktif: boolean): Promise<SonucDurumu> {
  const ayristirma = tipSemasi.safeParse(tip);
  if (!ayristirma.success) {
    return { success: false, message: "Geçersiz QR kodu." };
  }

  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { data: mevcutSatir } = await supabase
    .from("klinik_ayarlar")
    .select("ayarlar")
    .eq("klinik_id", klinikId)
    .maybeSingle();

  const mevcutAyarlar = (mevcutSatir?.ayarlar as Record<string, unknown> | null) ?? {};
  const mevcutQrKodlari = (mevcutAyarlar.qr_kodlari as Record<string, { aktif: boolean }> | undefined) ?? {};

  const guncelAyarlar = {
    ...mevcutAyarlar,
    qr_kodlari: {
      ...mevcutQrKodlari,
      [ayristirma.data]: { aktif },
    },
  };

  const { error } = await supabase
    .from("klinik_ayarlar")
    .upsert({ klinik_id: klinikId, ayarlar: guncelAyarlar }, { onConflict: "klinik_id" });

  if (error) {
    console.error("QR kodu durumu güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/qr-kodlar");
  return { success: true, message: aktif ? "QR kodu aktifleştirildi." : "QR kodu pasife alındı." };
}

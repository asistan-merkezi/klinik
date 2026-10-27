"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import type { QrKodTipi } from "@/lib/qr/qr-kod-tanimlari";

type SonucDurumu = { success: boolean; message: string } | null;

const tipSemasi = z.enum(["hasta_on_kayit", "anket", "puantaj_giris", "puantaj_cikis"]);

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

  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") {
    return { success: false, message: YETKISIZ_MESAJI };
  }
  const { bag, klinikId } = y;

  try {
    // Okuma-değiştirme-yazma TEK transaction'da: eşzamanlı iki güncelleme diğer ayar anahtarlarını (tablet vb.) ezmesin diye satır kilitlenir.
    await withTenant(bag, async (tx) => {
      const mevcutSatir = (await tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, klinikId)).for("update").limit(1))[0];
      const mevcutAyarlar = (mevcutSatir?.ayarlar as Record<string, unknown> | null) ?? {};
      const mevcutQrKodlari = (mevcutAyarlar.qr_kodlari as Record<string, { aktif: boolean }> | undefined) ?? {};
      const guncelAyarlar = { ...mevcutAyarlar, qr_kodlari: { ...mevcutQrKodlari, [ayristirma.data]: { aktif } } };
      await tx.insert(sema.klinikAyarlar).values({ klinikId, ayarlar: guncelAyarlar }).onConflictDoUpdate({ target: sema.klinikAyarlar.klinikId, set: { ayarlar: guncelAyarlar } });
    });
  } catch (e) {
    console.error("QR kodu durumu güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/qr-kodlar");
  return { success: true, message: aktif ? "QR kodu aktifleştirildi." : "QR kodu pasife alındı." };
}

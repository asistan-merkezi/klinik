"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { sema, pgHata } from "@/lib/db";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { anonimUcCalistir } from "@/lib/guvenlik/anonim-uc";

type SonucDurumu = { success: boolean; message: string } | null;

// Klinik kimliği formdan ALINMAZ: kısa kod (URL parametresi, sunucu eylemine bind edilir) tanima şemasıyla klinik'e çözülür.
const semasi = z
  .object({
    puan: z.union([z.coerce.number().int().min(1).max(5), z.literal("")]).optional(),
    oneri_metni: z.string().trim().max(2000, "Öneri en fazla 2000 karakter olabilir.").optional(),
    ad_soyad: z.string().trim().max(120, "Ad soyad çok uzun.").optional(),
    telefon: z.string().trim().max(20, "Telefon numarası geçersiz.").optional(),
  })
  .refine((v) => (v.puan !== "" && v.puan !== undefined) || (v.oneri_metni && v.oneri_metni.length > 0), {
    message: "Lütfen bir puan verin veya öneri yazın.",
  });

export async function anketYanitiOlustur(kisaKod: string, _onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    puan: formData.get("puan") ?? "",
    oneri_metni: formData.get("oneri_metni") ?? "",
    ad_soyad: formData.get("ad_soyad") ?? "",
    telefon: formData.get("telefon") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { puan, oneri_metni, ad_soyad, telefon } = ayristirma.data;

  // Hız sınırı (FAIL-CLOSED), kısa kod → klinik, kapalı QR'a doğrudan POST reddi ve `klinik_anonim` ile yazma: tek kapı.
  const sonuc = await anonimUcCalistir(
    { ucAdi: "anket", kisaKod, basliklar: await headers(), qrTipi: "anket", ipLimiti: 10, kodGunlukLimiti: 500 },
    (tx, klinik) =>
      tx.insert(sema.anketYaniti).values({
        klinikId: klinik.id,
        puan: puan === "" || puan === undefined ? null : puan,
        oneriMetni: oneri_metni || null,
        adSoyad: ad_soyad ? isimBasHarfBuyukYap(ad_soyad) : null,
        telefon: telefon || null,
      })
  ).catch((e) => {
    console.error("Anket yanıtı oluşturulamadı:", pgHata(e).mesaj);
    return null;
  });

  if (!sonuc) return { success: false, message: "Gönderilemedi, lütfen tekrar deneyin." };
  if (!sonuc.ok) return { success: false, message: sonuc.kod === "kapali" ? "Bu anket bağlantısı artık aktif değil." : sonuc.mesaj };
  return { success: true, message: "Geri bildiriminiz için teşekkür ederiz." };
}

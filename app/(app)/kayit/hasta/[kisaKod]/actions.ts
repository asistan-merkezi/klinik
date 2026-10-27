"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { sema, pgHata } from "@/lib/db";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { anonimUcCalistir } from "@/lib/guvenlik/anonim-uc";

type SonucDurumu = { success: boolean; message: string } | null;

const telefonSemasi = z
  .string()
  .trim()
  .min(7, "Telefon numarası geçersiz.")
  .max(20, "Telefon numarası geçersiz.")
  .regex(/^[0-9+ ]+$/, "Telefon sadece rakam, boşluk ve + içerebilir.");

// Klinik kimliği formdan ALINMAZ: kısa kod (URL parametresi, sunucu eylemine bind edilir) tanima şemasıyla klinik'e çözülür.
const semasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı.").max(120, "Ad soyad çok uzun."),
  telefon: telefonSemasi,
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  kimlik_no: z
    .string()
    .trim()
    .max(20, "Kimlik numarası geçersiz.")
    .regex(/^[A-Za-z0-9]*$/, "Kimlik numarası yalnız harf ve rakam içerebilir.")
    .optional(),
  kimlik_no_tipi: z.enum(["tc", "pasaport"]).optional(),
  whatsapp_izin_durumu: z.coerce.boolean().optional(),
  ticari_ileti_onay: z.coerce.boolean().optional(),
  kvkk_onay: z.coerce.boolean(),
});

export async function hastaQrKayitOlustur(
  kisaKod: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    kimlik_no: formData.get("kimlik_no") ?? "",
    kimlik_no_tipi: formData.get("kimlik_no_tipi") || undefined,
    whatsapp_izin_durumu: formData.get("whatsapp_izin_durumu") === "on",
    ticari_ileti_onay: formData.get("ticari_ileti_onay") === "on",
    kvkk_onay: formData.get("kvkk_onay") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad_soyad, telefon, dogum_tarihi, kimlik_no, kimlik_no_tipi, whatsapp_izin_durumu, ticari_ileti_onay, kvkk_onay } = ayristirma.data;

  if (!kvkk_onay) {
    return { success: false, message: "Devam etmek için KVKK Aydınlatma Metni'ni onaylamanız gerekiyor." };
  }

  // Hız sınırı (FAIL-CLOSED), kısa kod → klinik, QR açık mı (kapalı QR'a doğrudan POST de reddedilir) ve yazma `klinik_anonim` rolüyle tek kapıdan:
  // IP: 10 dk'da 10 kayıt (klinik bekleme salonu tek NAT IP'si olabilir); klinik toplamı: günde 300 — sahte kayıtla DB şişirmeye karşı tavan.
  const sonuc = await anonimUcCalistir(
    { ucAdi: "qr_kayit", kisaKod, basliklar: await headers(), qrTipi: "hasta_on_kayit", ipLimiti: 10, kodGunlukLimiti: 300 },
    async (tx, klinik) => {
      const simdi = new Date().toISOString();
      // Not: anon rolünün hasta üzerinde hiçbir SELECT policy'si yok (bilinçli — aksi halde herkes tüm QR-kayıtlı hastaları listeleyebilirdi).
      // INSERT ... RETURNING SELECT policy'sine de tabi olduğundan id'yi burada üretip RETURNING kullanmıyoruz.
      const yeniHastaId = crypto.randomUUID();
      await tx.insert(sema.hasta).values({
        id: yeniHastaId,
        klinikId: klinik.id,
        adSoyad: isimBasHarfBuyukYap(ad_soyad),
        telefon,
        dogumTarihi: dogum_tarihi ? dogum_tarihi : null,
        whatsappIzinDurumu: whatsapp_izin_durumu ?? false,
        ticariIletiOnayTarihi: ticari_ileti_onay ? simdi : null,
        ticariIletiOnaylayanTip: ticari_ileti_onay ? "hasta" : null,
        kvkkOnayTarihi: simdi,
        kvkkOnaylayanTip: "hasta",
        referansKanali: "QR Kod",
        kayitKanali: "qr_self_servis",
      });

      if (kimlik_no) {
        try {
          // Savepoint: kimlik çakışması (23505) hasta kaydını geri ALMAZ (eski davranış: kayıt alınır, resepsiyon birleştirir).
          await tx.transaction((sp) => sp.insert(sema.hastaHassas).values({ hastaId: yeniHastaId, klinikId: klinik.id, kimlikNo: kimlik_no, kimlikNoTipi: kimlik_no_tipi ?? "tc" }));
        } catch (e) {
          const h = pgHata(e);
          console.error("QR hasta kimlik bilgisi kaydedilemedi:", h.mesaj);
          return h.kod === "23505"
            ? "Kaydınız alındı. Bu kimlik numarasıyla sistemde başka bir kayıt bulunuyor — resepsiyon kayıtları birleştirecektir."
            : "Kaydınız alındı. Kimlik bilginiz resepsiyonda ayrıca alınacaktır.";
        }
      }
      return "Kaydınız alındı. Klinik personeli sizi resepsiyonda karşılayacaktır.";
    }
  ).catch((e) => {
    console.error("QR hasta kaydı oluşturulamadı:", pgHata(e).mesaj);
    return null;
  });

  if (!sonuc) return { success: false, message: "Kayıt oluşturulamadı, lütfen bilgilerinizi kontrol edip tekrar deneyin." };
  if (!sonuc.ok) return { success: false, message: sonuc.kod === "kapali" ? "Bu kayıt bağlantısı artık aktif değil." : sonuc.mesaj };
  return { success: true, message: sonuc.sonuc };
}

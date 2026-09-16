"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isimBasHarfBuyukYap } from "@/lib/utils";

type SonucDurumu = { success: boolean; message: string } | null;

const telefonSemasi = z
  .string()
  .trim()
  .min(7, "Telefon numarası geçersiz.")
  .max(20, "Telefon numarası geçersiz.")
  .regex(/^[0-9+ ]+$/, "Telefon sadece rakam, boşluk ve + içerebilir.");

const semasi = z.object({
  klinik_id: z.string().uuid("Geçersiz bağlantı."),
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  telefon: telefonSemasi,
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  kimlik_no: z.string().trim().optional(),
  kimlik_no_tipi: z.enum(["tc", "pasaport"]).optional(),
  whatsapp_izin_durumu: z.coerce.boolean().optional(),
  ticari_ileti_onay: z.coerce.boolean().optional(),
  kvkk_onay: z.coerce.boolean(),
});

export async function hastaQrKayitOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    klinik_id: formData.get("klinik_id"),
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

  const {
    klinik_id,
    ad_soyad,
    telefon,
    dogum_tarihi,
    kimlik_no,
    kimlik_no_tipi,
    whatsapp_izin_durumu,
    ticari_ileti_onay,
    kvkk_onay,
  } = ayristirma.data;

  if (!kvkk_onay) {
    return { success: false, message: "Devam etmek için KVKK Aydınlatma Metni'ni onaylamanız gerekiyor." };
  }

  const supabase = await createClient();
  const simdi = new Date().toISOString();
  // Not: anon rolünün hasta üzerinde hiçbir SELECT policy'si yok (bilinçli —
  // aksi halde herkes tüm QR-kayıtlı hastaları listeleyebilirdi). Postgres RLS,
  // INSERT ... RETURNING'i SELECT policy'sine göre de denetlediği için (yoksa
  // "new row violates row-level security policy" hatası veriyor), id'yi
  // RETURNING ile geri almak yerine burada üretip insert'e veriyoruz.
  const yeniHastaId = crypto.randomUUID();

  const { error } = await supabase.from("hasta").insert({
    id: yeniHastaId,
    klinik_id,
    ad_soyad: isimBasHarfBuyukYap(ad_soyad),
    telefon,
    dogum_tarihi: dogum_tarihi ? dogum_tarihi : null,
    whatsapp_izin_durumu: whatsapp_izin_durumu ?? false,
    ticari_ileti_onay_tarihi: ticari_ileti_onay ? simdi : null,
    ticari_ileti_onaylayan_tip: ticari_ileti_onay ? "hasta" : null,
    kvkk_onay_tarihi: simdi,
    kvkk_onaylayan_tip: "hasta",
    referans_kanali: "QR Kod",
    kayit_kanali: "qr_self_servis",
  });

  if (error) {
    console.error("QR hasta kaydı oluşturulamadı:", error);
    return { success: false, message: "Kayıt oluşturulamadı, lütfen bilgilerinizi kontrol edip tekrar deneyin." };
  }

  if (kimlik_no) {
    const { error: hassasError } = await supabase.from("hasta_hassas").insert({
      hasta_id: yeniHastaId,
      kimlik_no,
      kimlik_no_tipi: kimlik_no_tipi ?? "tc",
    });
    if (hassasError) {
      console.error("QR hasta kimlik bilgisi kaydedilemedi:", hassasError);
      if (hassasError.code === "23505") {
        return {
          success: true,
          message:
            "Kaydınız alındı. Bu kimlik numarasıyla sistemde başka bir kayıt bulunuyor — resepsiyon kayıtları birleştirecektir.",
        };
      }
      return { success: true, message: "Kaydınız alındı. Kimlik bilginiz resepsiyonda ayrıca alınacaktır." };
    }
  }

  return { success: true, message: "Kaydınız alındı. Klinik personeli sizi resepsiyonda karşılayacaktır." };
}

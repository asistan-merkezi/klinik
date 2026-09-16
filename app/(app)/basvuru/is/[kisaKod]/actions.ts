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

const bosVeyaMetin = z.string().trim().optional().or(z.literal(""));

const semasi = z.object({
  klinik_id: z.string().uuid("Geçersiz bağlantı."),
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  telefon: telefonSemasi,
  eposta: z.union([z.string().trim().email("Geçersiz e-posta."), z.literal("")]).optional(),
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  tc_kimlik_no: bosVeyaMetin,
  adres: bosVeyaMetin,
  pozisyon: bosVeyaMetin,
  bizi_nereden_duydunuz: bosVeyaMetin,
  calismaya_baslama_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  calisma_sekli: z.enum(["tam_zamanli", "yari_zamanli"]).optional().or(z.literal("")),
  beklenen_ucret: bosVeyaMetin,
  egitim_okul_bolum: bosVeyaMetin,
  egitim_mezuniyet_yili: bosVeyaMetin,
  egitim_sertifikalar: bosVeyaMetin,
  kvkk_onay: z.coerce.boolean(),
});

// PDF'teki 3 satırlık İş Deneyimi / 2 satırlık Referanslar ile aynı sayıda —
// public formda dinamik ekle/sil yerine sabit satır sayısı kullanıldı (bkz.
// is-basvuru-formu.tsx), boş bırakılan satırlar burada eleniyor.
function deneyimleriTopla(formData: FormData): { sirket: string; gorev: string; sure: string }[] {
  const satirlar = [];
  for (let i = 1; i <= 3; i++) {
    const sirket = (formData.get(`deneyim${i}_sirket`) as string | null)?.trim() ?? "";
    const gorev = (formData.get(`deneyim${i}_gorev`) as string | null)?.trim() ?? "";
    const sure = (formData.get(`deneyim${i}_sure`) as string | null)?.trim() ?? "";
    if (sirket || gorev || sure) satirlar.push({ sirket, gorev, sure });
  }
  return satirlar;
}

function referanslariTopla(formData: FormData): { ad_soyad: string; telefon: string; baglanti: string }[] {
  const satirlar = [];
  for (let i = 1; i <= 2; i++) {
    const adSoyad = (formData.get(`referans${i}_ad_soyad`) as string | null)?.trim() ?? "";
    const telefon = (formData.get(`referans${i}_telefon`) as string | null)?.trim() ?? "";
    const baglanti = (formData.get(`referans${i}_baglanti`) as string | null)?.trim() ?? "";
    if (adSoyad || telefon || baglanti) satirlar.push({ ad_soyad: adSoyad, telefon, baglanti });
  }
  return satirlar;
}

export async function isBasvurusuOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    klinik_id: formData.get("klinik_id"),
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    eposta: formData.get("eposta") ?? "",
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    tc_kimlik_no: formData.get("tc_kimlik_no") ?? "",
    adres: formData.get("adres") ?? "",
    pozisyon: formData.get("pozisyon") ?? "",
    bizi_nereden_duydunuz: formData.get("bizi_nereden_duydunuz") ?? "",
    calismaya_baslama_tarihi: formData.get("calismaya_baslama_tarihi") ?? "",
    calisma_sekli: formData.get("calisma_sekli") || "",
    beklenen_ucret: formData.get("beklenen_ucret") ?? "",
    egitim_okul_bolum: formData.get("egitim_okul_bolum") ?? "",
    egitim_mezuniyet_yili: formData.get("egitim_mezuniyet_yili") ?? "",
    egitim_sertifikalar: formData.get("egitim_sertifikalar") ?? "",
    kvkk_onay: formData.get("kvkk_onay") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const veri = ayristirma.data;

  if (!veri.kvkk_onay) {
    return { success: false, message: "Devam etmek için KVKK onay kutucuğunu işaretlemeniz gerekiyor." };
  }

  const supabase = await createClient();
  const simdi = new Date().toISOString();

  const { error } = await supabase.from("is_basvurusu").insert({
    klinik_id: veri.klinik_id,
    ad_soyad: isimBasHarfBuyukYap(veri.ad_soyad),
    telefon: veri.telefon,
    eposta: veri.eposta || null,
    dogum_tarihi: veri.dogum_tarihi || null,
    tc_kimlik_no: veri.tc_kimlik_no || null,
    adres: veri.adres || null,
    pozisyon: veri.pozisyon || null,
    bizi_nereden_duydunuz: veri.bizi_nereden_duydunuz || null,
    calismaya_baslama_tarihi: veri.calismaya_baslama_tarihi || null,
    calisma_sekli: veri.calisma_sekli || null,
    beklenen_ucret: veri.beklenen_ucret || null,
    egitim_okul_bolum: veri.egitim_okul_bolum || null,
    egitim_mezuniyet_yili: veri.egitim_mezuniyet_yili || null,
    egitim_sertifikalar: veri.egitim_sertifikalar || null,
    is_deneyimi: deneyimleriTopla(formData),
    referanslar: referanslariTopla(formData),
    kvkk_onay: true,
    kvkk_onay_tarihi: simdi,
  });

  if (error) {
    console.error("İş başvurusu oluşturulamadı:", error);
    return { success: false, message: "Başvurunuz kaydedilemedi, lütfen tekrar deneyin." };
  }

  return { success: true, message: "Başvurunuz alındı. Teşekkür ederiz." };
}

"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { sema, pgHata } from "@/lib/db";
import { anonimUcCalistir } from "@/lib/guvenlik/anonim-uc";
import { isimBasHarfBuyukYap } from "@/lib/utils";

type SonucDurumu = { success: boolean; message: string } | null;

const telefonSemasi = z
  .string()
  .trim()
  .min(7, "Telefon numarası geçersiz.")
  .max(20, "Telefon numarası geçersiz.")
  .regex(/^[0-9+ ]+$/, "Telefon sadece rakam, boşluk ve + içerebilir.");

// Anonim form: her serbest metin alanına üst sınır (sınırsız metinle DB şişirilemesin).
const bosVeyaMetin = z.string().trim().max(500, "Metin çok uzun.").optional().or(z.literal(""));
const kisaMetin = (s: string) => s.trim().slice(0, 200);

const semasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı.").max(120, "Ad soyad çok uzun."),
  telefon: telefonSemasi,
  eposta: z.union([z.string().trim().max(254).email("Geçersiz e-posta."), z.literal("")]).optional(),
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  tc_kimlik_no: z.string().trim().max(20, "Kimlik numarası geçersiz.").optional().or(z.literal("")),
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
    const sirket = kisaMetin(String(formData.get(`deneyim${i}_sirket`) ?? ""));
    const gorev = kisaMetin(String(formData.get(`deneyim${i}_gorev`) ?? ""));
    const sure = kisaMetin(String(formData.get(`deneyim${i}_sure`) ?? ""));
    if (sirket || gorev || sure) satirlar.push({ sirket, gorev, sure });
  }
  return satirlar;
}

function referanslariTopla(formData: FormData): { ad_soyad: string; telefon: string; baglanti: string }[] {
  const satirlar = [];
  for (let i = 1; i <= 2; i++) {
    const adSoyad = kisaMetin(String(formData.get(`referans${i}_ad_soyad`) ?? ""));
    const telefon = kisaMetin(String(formData.get(`referans${i}_telefon`) ?? ""));
    const baglanti = kisaMetin(String(formData.get(`referans${i}_baglanti`) ?? ""));
    if (adSoyad || telefon || baglanti) satirlar.push({ ad_soyad: adSoyad, telefon, baglanti });
  }
  return satirlar;
}

export async function isBasvurusuOlustur(kisaKod: string, _onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
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

  // Hasta ön kayıt/anket ile aynı koruma (hız sınırı FAIL-CLOSED, kısa kod → klinik, klinik_anonim ile yazma). Klinik formdan ALINMAZ.
  const simdi = new Date().toISOString();
  const sonuc = await anonimUcCalistir({ ucAdi: "is_basvurusu", kisaKod, basliklar: await headers(), ipLimiti: 5, kodGunlukLimiti: 100 }, (tx, klinik) =>
    tx.insert(sema.isBasvurusu).values({
      klinikId: klinik.id,
      adSoyad: isimBasHarfBuyukYap(veri.ad_soyad),
      telefon: veri.telefon,
      eposta: veri.eposta || null,
      dogumTarihi: veri.dogum_tarihi || null,
      tcKimlikNo: veri.tc_kimlik_no || null,
      adres: veri.adres || null,
      pozisyon: veri.pozisyon || null,
      biziNeredenDuydunuz: veri.bizi_nereden_duydunuz || null,
      calismayaBaslamaTarihi: veri.calismaya_baslama_tarihi || null,
      calismaSekli: veri.calisma_sekli || null,
      beklenenUcret: veri.beklenen_ucret || null,
      egitimOkulBolum: veri.egitim_okul_bolum || null,
      egitimMezuniyetYili: veri.egitim_mezuniyet_yili || null,
      egitimSertifikalar: veri.egitim_sertifikalar || null,
      isDeneyimi: deneyimleriTopla(formData),
      referanslar: referanslariTopla(formData),
      kvkkOnay: true,
      kvkkOnayTarihi: simdi,
    })
  ).catch((e) => {
    console.error("İş başvurusu oluşturulamadı:", pgHata(e).mesaj);
    return null;
  });

  if (!sonuc) return { success: false, message: "Başvurunuz kaydedilemedi, lütfen tekrar deneyin." };
  if (!sonuc.ok) return { success: false, message: sonuc.mesaj };
  return { success: true, message: "Başvurunuz alındı. Teşekkür ederiz." };
}

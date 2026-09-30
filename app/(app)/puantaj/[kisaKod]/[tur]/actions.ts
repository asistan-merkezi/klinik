"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { qrKoduAktifMi } from "@/lib/qr/qr-kod-aktif-mi";
import {
  hizSiniriAsildiMi,
  hizSiniriKaydet,
  ipAnahtari,
  klinikAnahtari,
  HIZ_SINIRI_MESAJI,
} from "@/lib/qr/hiz-siniri";

type SonucDurumu = { success: boolean; message: string; adSoyad?: string; saat?: string } | null;

const semasi = z.object({
  klinik_id: z.string().uuid("Geçersiz bağlantı."),
  tur: z.enum(["giris", "cikis"]),
  pin: z.string().regex(/^\d{6}$/, "PIN 6 haneli rakamlardan oluşmalı."),
});

const HATA_MESAJLARI: Record<string, string> = {
  pin_gecersiz: "PIN 6 haneli rakamlardan oluşmalı.",
  tur_gecersiz: "Geçersiz işlem.",
  pin_bulunamadi: "PIN hatalı veya tanımlı değil.",
  donem_kapali: "Bu ay dönemi kapalı, kayıt alınamıyor.",
  giris_zaten_var: "Bugün için giriş zaten kaydedilmiş.",
  once_giris_gerekli: "Önce giriş kaydedilmeli.",
  cikis_zaten_var: "Bugün için çıkış zaten kaydedilmiş.",
};

/**
 * QR ile puantaj — kimlik doğrulaması KULLANICI OTURUMU değil, PIN'in
 * klinikteki personele eşleştirilmesi (bkz. personel_puantaj_pin_ile_kaydet
 * RPC, migration 20260810100000). Bu yüzden burada createClient() anonim
 * (RLS'te anon rolü) çağrılıyor — anket_yaniti/hasta ön kayıt akışlarıyla
 * aynı desen.
 */
export async function puantajPinIleKaydet(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    klinik_id: formData.get("klinik_id"),
    tur: formData.get("tur"),
    pin: formData.get("pin"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { klinik_id, tur, pin } = ayristirma.data;

  // RPC yalnız personelin aktif olup olmadığını kontrol ediyor, QR'ın
  // klinik_admin tarafından kapatılıp kapatılmadığını değil — page.tsx'teki
  // kontrol server action'ı korumaz, burada da ayrıca zorlanmalı.
  const aktif = await qrKoduAktifMi(klinik_id, tur === "giris" ? "puantaj_giris" : "puantaj_cikis");
  if (!aktif) {
    return { success: false, message: "Bu puantaj bağlantısı artık aktif değil." };
  }

  // 6 haneli PIN tüm klinik havuzuna karşı deneniyor (1M olasılık) → kaba kuvvet
  // riski. Personel aynı klinik IP'sinden sabah toplu giriş yaptığı için BAŞARILI
  // kayıtlar sayılmaz; yalnız başarısız (pin_bulunamadi) denemeler sayılır.
  const basarisizKurallar = [
    { anahtar: await ipAnahtari("puantaj_basarisiz"), limit: 10, pencereSn: 600 },
    { anahtar: klinikAnahtari("puantaj_basarisiz", klinik_id), limit: 40, pencereSn: 600 },
  ];
  if (await hizSiniriAsildiMi(basarisizKurallar)) {
    return { success: false, message: HIZ_SINIRI_MESAJI };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("personel_puantaj_pin_ile_kaydet", {
    p_klinik_id: klinik_id,
    p_pin: pin,
    p_tur: tur,
  });

  if (error) {
    console.error("Puantaj PIN ile kayıt başarısız:", error);
    if (error.message === "pin_bulunamadi") {
      await hizSiniriKaydet(basarisizKurallar);
    }
    return { success: false, message: HATA_MESAJLARI[error.message] ?? "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  const sonuc = data as { ad_soyad?: string; saat?: string } | null;

  return {
    success: true,
    message: tur === "giris" ? "Giriş kaydedildi." : "Çıkış kaydedildi.",
    adSoyad: sonuc?.ad_soyad,
    saat: sonuc?.saat,
  };
}

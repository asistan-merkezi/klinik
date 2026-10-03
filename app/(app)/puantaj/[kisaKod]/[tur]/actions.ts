"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { qrKoduAktifMi } from "@/lib/qr/qr-kod-aktif-mi";

type SonucDurumu = { success: boolean; message: string; adSoyad?: string; saat?: string } | null;

const semasi = z.object({
  klinik_id: z.string().uuid("Geçersiz bağlantı."),
  tur: z.enum(["giris", "cikis"]),
});

const HATA_MESAJLARI: Record<string, string> = {
  yetkisiz: "Oturumunuz bulunamadı, lütfen tekrar giriş yapın.",
  tur_gecersiz: "Geçersiz işlem.",
  personel_bulunamadi: "Hesabınıza bağlı aktif bir personel kaydı bulunamadı.",
  donem_kapali: "Bu ay dönemi kapalı, kayıt alınamıyor.",
  izinli_gun: "Bugün izinli/raporlu görünüyorsunuz, kayıt alınamıyor.",
  giris_zaten_var: "Bugün için giriş zaten kaydedilmiş.",
  once_giris_gerekli: "Önce giriş kaydedilmeli.",
  cikis_zaten_var: "Bugün için çıkış zaten kaydedilmiş.",
  cikis_giristen_once: "Çıkış saati giriş saatinden sonra olmalı.",
};

/**
 * QR ile puantaj — kimlik KULLANICI OTURUMUNDAN gelir (PIN yok). Kişi/saat
 * istemciden alınmaz: RPC `auth.uid()` ile personeli bulur, saati sunucuda
 * `now()` ile yazar (bkz. personel_puantaj_kendi_kaydet, migration 20261003100000).
 * Sayfa kapısı (`page.tsx`) server action'ı korumaz — QR'ın açık olması ve QR'ın
 * kullanıcının kendi kliniğine ait olması burada ayrıca zorlanır.
 */
export async function puantajKendiKaydet(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const ayristirma = semasi.safeParse({
    klinik_id: formData.get("klinik_id"),
    tur: formData.get("tur"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { klinik_id, tur } = ayristirma.data;

  const oturum = await gecerliKullanici();
  if (!oturum?.kullanici?.klinik_id) {
    return { success: false, message: HATA_MESAJLARI.yetkisiz };
  }

  // Başka kliniğin QR'ını okutan kişi o klinikte kayıt açamaz.
  if (oturum.kullanici.klinik_id !== klinik_id) {
    return { success: false, message: "Bu QR kodu sizin kliniğinize ait değil." };
  }

  const aktif = await qrKoduAktifMi(klinik_id, tur === "giris" ? "puantaj_giris" : "puantaj_cikis");
  if (!aktif) {
    return { success: false, message: "Bu puantaj bağlantısı artık aktif değil." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("personel_puantaj_kendi_kaydet", { p_tur: tur });

  if (error) {
    console.error("Puantaj kendi kaydı başarısız:", error);
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

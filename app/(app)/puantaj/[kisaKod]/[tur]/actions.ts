"use server";

import { z } from "zod";
import { pgHata, rpc, withTenant } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { klinikQrBilgisi, qrAktifMi } from "@/lib/guvenlik/anonim-uc";

type SonucDurumu = { success: boolean; message: string; adSoyad?: string; saat?: string } | null;

const TUR = z.enum(["giris", "cikis"]);

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
 * QR ile puantaj — kimlik KULLANICI OTURUMUNDAN gelir (PIN yok). Kişi/saat/klinik istemciden alınmaz: klinik QR'ın KISA KODUNDAN çözülür
 * (tanima), oturumdaki kullanıcının kliniğiyle eşleşmeli; RPC `auth.uid()` ile personeli bulur, saati sunucuda `now()` ile yazar
 * (bkz. personel_puantaj_kendi_kaydet). Sayfa kapısı server action'ı korumaz — QR'ın açık olması ve kliniğin eşleşmesi burada ayrıca zorlanır.
 */
export async function puantajKendiKaydet(kisaKod: string, turHam: string, _onceki: SonucDurumu, _formData: FormData): Promise<SonucDurumu> {
  void _formData;
  const tur = TUR.safeParse(turHam);
  if (!tur.success) return { success: false, message: "Geçersiz işlem." };

  const ctx = await oturumBaglami();
  if (!ctx || ctx.tur !== "personel" || !ctx.tenantId) {
    return { success: false, message: HATA_MESAJLARI.yetkisiz };
  }

  const klinik = await klinikQrBilgisi(kisaKod);
  if (!klinik) return { success: false, message: "Geçersiz bağlantı." };
  // Başka kliniğin QR'ını okutan kişi o klinikte kayıt açamaz.
  if (ctx.tenantId !== klinik.id) {
    return { success: false, message: "Bu QR kodu sizin kliniğinize ait değil." };
  }

  if (!(await qrAktifMi(klinik.id, tur.data === "giris" ? "puantaj_giris" : "puantaj_cikis"))) {
    return { success: false, message: "Bu puantaj bağlantısı artık aktif değil." };
  }

  try {
    const r = await withTenant(tenantGerekli(ctx), (tx) => rpc<{ personel_puantaj_kendi_kaydet: { ad_soyad?: string; saat?: string } | null }>(tx, "personel_puantaj_kendi_kaydet", { p_tur: tur.data }));
    const sonuc = r[0]?.personel_puantaj_kendi_kaydet ?? null;
    return {
      success: true,
      message: tur.data === "giris" ? "Giriş kaydedildi." : "Çıkış kaydedildi.",
      adSoyad: sonuc?.ad_soyad,
      saat: sonuc?.saat,
    };
  } catch (e) {
    const m = pgHata(e).mesaj;
    console.error("Puantaj kendi kaydı başarısız:", m);
    return { success: false, message: HATA_MESAJLARI[m] ?? "Kaydedilemedi, lütfen tekrar deneyin." };
  }
}

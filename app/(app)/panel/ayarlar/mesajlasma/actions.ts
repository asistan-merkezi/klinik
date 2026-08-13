"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { bilinmeyenDegiskenleriBul } from "@/lib/mesaj/degisken-dogrula";

type SonucDurumu = { success: boolean; message: string };

const MESAJ_METNI_MAX_UZUNLUK = 1000;

async function klinikAdminDogrula() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol, klinik_id")
    .eq("id", user.id)
    .single();

  if (!kullanici || kullanici.rol !== "klinik_admin" || !kullanici.klinik_id) {
    return null;
  }

  return { supabase, klinikId: kullanici.klinik_id };
}

type KuralGuncellemeAlanlari = {
  aktif: boolean;
  sms_aktif: boolean;
  whatsapp_aktif: boolean;
  mail_aktif: boolean;
  mesaj_metni: string;
};

/**
 * Kural düzenleme dialogundaki TEK "Değişiklikleri Kaydet" butonu — Aktif
 * switch'i, SMS/WhatsApp/Mail kanal seçimi ve mesaj metnini AYNI ANDA, tek
 * satırda kaydeder. Tetikleyici kataloğu artık kodda sabit (bkz. lib/mesaj/
 * tetikleyiciler.ts) — DB'de (mesaj_kurallari) bu tetikleyici için hiç satır
 * olmayabilir ("kayıt yoksa pasif" kuralı), bu yüzden düz `.update()` değil
 * `.upsert()` kullanılıyor: ilk kez kaydedilen bir kural burada satırını
 * oluşturur.
 */
export async function kuralGuncelle(tetikleyiciKodu: string, alanlar: KuralGuncellemeAlanlari): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const tanim = tetikleyiciGetir(tetikleyiciKodu);
  if (!tanim) {
    return { success: false, message: "Geçersiz tetikleyici." };
  }

  const metin = alanlar.mesaj_metni.trim().slice(0, MESAJ_METNI_MAX_UZUNLUK);
  const bilinmeyenler = bilinmeyenDegiskenleriBul(metin, tanim.gecerliDegiskenler);
  if (bilinmeyenler.length > 0) {
    return { success: false, message: `Bilinmeyen değişken(ler): ${bilinmeyenler.map((d) => `{{${d}}}`).join(", ")}` };
  }

  const { error } = await yetki.supabase.from("mesaj_kurallari").upsert(
    {
      klinik_id: yetki.klinikId,
      tetikleyici_kodu: tetikleyiciKodu,
      aktif: alanlar.aktif,
      sms_aktif: alanlar.sms_aktif,
      whatsapp_aktif: alanlar.whatsapp_aktif,
      mail_aktif: alanlar.mail_aktif,
      mesaj_metni: metin,
    },
    { onConflict: "klinik_id,tetikleyici_kodu" }
  );

  if (error) {
    console.error("Mesaj kuralı güncellenemedi:", error.message);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/mesajlasma");
  return { success: true, message: "Değişiklikler kaydedildi." };
}

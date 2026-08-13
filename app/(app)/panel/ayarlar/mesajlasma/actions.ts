"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { testMesajGonder } from "@/lib/mesajlasma/gonderici";
import type { MesajBolum, MesajKanal } from "@/types/mesajlasma";

type SonucDurumu = { success: boolean; message: string };

const TEST_SONUC_MESAJI: Record<string, string> = {
  kural_kapali: "Bu kural şu an kapalı — önce aktif hale getirin.",
  kanal_kapali: "Bu kanal bu kural için kapalı.",
  yetersiz_bakiye: "Bu kanalda yeterli kredi yok.",
  cok_sik_deneme: "Çok sık test gönderdiniz, birkaç saniye bekleyip tekrar deneyin.",
  hata: "Test gönderilemedi.",
};

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
 * switch'i, SMS/WhatsApp/Mail kanal seçimi ve mesaj metnini AYNI ANDA,
 * tek update ile kaydeder. Önceden kanal/aktif checkbox'ları tıklanır
 * tıklanmaz ayrı ayrı kaydediyordu, mesaj metni ise sadece kendi başına
 * "değişti" olduğunda buton aktifleşiyordu — kullanıcı sadece checkbox
 * değiştirip metne dokunmadığında buton devre dışı kalıyor, "kaydetmiyor"
 * gibi görünüyordu. Artık tüm alanlar tek taslak/tek kaydetme akışını
 * paylaşıyor.
 */
export async function kuralGuncelle(kuralId: string, alanlar: KuralGuncellemeAlanlari): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await yetki.supabase
    .from("mesaj_kural")
    .update({
      aktif: alanlar.aktif,
      sms_aktif: alanlar.sms_aktif,
      whatsapp_aktif: alanlar.whatsapp_aktif,
      mail_aktif: alanlar.mail_aktif,
      mesaj_metni: alanlar.mesaj_metni.trim().slice(0, MESAJ_METNI_MAX_UZUNLUK),
    })
    .eq("id", kuralId)
    .eq("klinik_id", yetki.klinikId);

  if (error) {
    console.error("Mesaj kuralı güncellenemedi:", error.message);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/mesajlasma");
  return { success: true, message: "Değişiklikler kaydedildi." };
}

/** Kural kutucuğundaki "Test Gönder" — gerçek gönderim yolunu (kredi düşümü + log dahil) test eder. */
export async function testGonderAction(
  bolum: MesajBolum,
  tetikleyiciKod: string,
  kanal: MesajKanal
): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const sonuc = await testMesajGonder({ klinikId: yetki.klinikId, bolum, kanal, tetikleyiciKod });

  if (!sonuc.gonderildi) {
    return { success: false, message: TEST_SONUC_MESAJI[sonuc.sebep] ?? "Test gönderilemedi." };
  }

  revalidatePath("/panel/ayarlar/mesajlasma");
  revalidatePath(`/panel/ayarlar/mesajlasma/kredi/${kanal}`);
  return { success: true, message: "Test mesajı simüle edildi ve kredi düşüldü." };
}

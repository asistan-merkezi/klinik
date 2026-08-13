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

/** Bir kuralın SMS/WhatsApp/Mail kanal checkbox'larından biri veya genel "Aktif" switch'i. */
export async function kuralAlanGuncelle(
  kuralId: string,
  alan: "sms_aktif" | "whatsapp_aktif" | "mail_aktif" | "aktif",
  deger: boolean
): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await yetki.supabase
    .from("mesaj_kural")
    .update({ [alan]: deger })
    .eq("id", kuralId)
    .eq("klinik_id", yetki.klinikId);

  if (error) {
    console.error("Mesaj kuralı güncellenemedi:", error.message);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/mesajlasma");
  return { success: true, message: "Güncellendi." };
}

/** Kural düzenleme kutucuğundaki "Metni Kaydet" — o tetikleyicide fiilen gönderilecek mesaj içeriği. */
export async function kuralMesajMetniGuncelle(kuralId: string, mesajMetni: string): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const metin = mesajMetni.trim().slice(0, MESAJ_METNI_MAX_UZUNLUK);

  const { error } = await yetki.supabase
    .from("mesaj_kural")
    .update({ mesaj_metni: metin })
    .eq("id", kuralId)
    .eq("klinik_id", yetki.klinikId);

  if (error) {
    console.error("Mesaj metni güncellenemedi:", error.message);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/mesajlasma");
  return { success: true, message: "Mesaj metni kaydedildi." };
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

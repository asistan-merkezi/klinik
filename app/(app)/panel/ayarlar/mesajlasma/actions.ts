"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { bilinmeyenDegiskenleriBul } from "@/lib/mesaj/degisken-dogrula";
import { kuyrukSatiriniIsle } from "@/lib/mesaj/kuyruk-isle";
import type { MesajKanal } from "@/types/mesajlasma";

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

const KANAL_ALAN = { sms: "sms_aktif", whatsapp: "whatsapp_aktif", mail: "mail_aktif" } as const;

const KUYRUK_DURUM_MESAJI: Record<string, (aliciAdres: string, hataMesaji?: string) => SonucDurumu> = {
  gonderildi: (aliciAdres) => ({ success: true, message: `Test mesajı gönderildi (${aliciAdres}).` }),
  hata: (_a, hata) => ({ success: false, message: `Gönderilemedi: ${hata ?? "bilinmeyen hata"}` }),
  iptal: (_a, hata) => ({
    success: false,
    message: hata === "kredi yetersiz" ? "Bu kanalda yeterli kredi yok." : `İptal edildi: ${hata ?? "bilinmeyen sebep"}`,
  }),
  beklemede: (_a, hata) => ({ success: false, message: `Geçici bir hata oluştu, otomatik tekrar denenecek: ${hata ?? ""}` }),
};

/**
 * Kural düzenleme dialogundaki "Test Gönder" — gerçek gönderim yolunun
 * (mesaj_kuyrugu → kredi düşümü → adapter → durum) TAMAMINI, sadece
 * test_mi=true işaretiyle çalıştırır. Alıcı HER ZAMAN giriş yapmış
 * kullanıcının kendi telefonu/e-postası — başka birine test mesajı
 * gönderilemez. Kuyruğa ekleme + işleme adımları service role (admin)
 * client'ıyla yapılıyor çünkü authenticated kullanıcının mesaj_kuyrugu'na
 * hiç INSERT/UPDATE RLS policy'si yok (bkz. Faz 1 migration) — yetki
 * kontrolü burada, bu fonksiyonun başında, service role client'a hiç
 * dokunulmadan ÖNCE yapılıyor.
 */
export async function testGonder(tetikleyiciKodu: string, kanal: MesajKanal): Promise<SonucDurumu> {
  const yetki = await klinikAdminDogrula();
  if (!yetki) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const tanim = tetikleyiciGetir(tetikleyiciKodu);
  if (!tanim) {
    return { success: false, message: "Geçersiz tetikleyici." };
  }

  const {
    data: { user: authUser },
  } = await yetki.supabase.auth.getUser();
  if (!authUser) {
    return { success: false, message: "Oturum bulunamadı." };
  }

  const { data: kural } = await yetki.supabase
    .from("mesaj_kurallari")
    .select("aktif, sms_aktif, whatsapp_aktif, mail_aktif, mesaj_metni")
    .eq("klinik_id", yetki.klinikId)
    .eq("tetikleyici_kodu", tetikleyiciKodu)
    .maybeSingle();

  if (!kural || !kural.aktif || !kural[KANAL_ALAN[kanal]]) {
    return { success: false, message: "Bu kural veya kanal aktif değil — önce kaydedin." };
  }

  let aliciAdres: string | null;
  if (kanal === "mail") {
    aliciAdres = authUser.email ?? null;
  } else {
    const { data: kullaniciSatiri } = await yetki.supabase.from("kullanici").select("telefon").eq("id", authUser.id).single();
    aliciAdres = kullaniciSatiri?.telefon ?? null;
  }

  if (!aliciAdres) {
    return {
      success: false,
      message: kanal === "mail" ? "Hesabınızda e-posta bulunamadı." : "Hesabınızda telefon numarası bulunamadı.",
    };
  }

  const admin = createAdminClient();
  const { data: yeniSatir, error: eklemeHata } = await admin
    .from("mesaj_kuyrugu")
    .insert({
      klinik_id: yetki.klinikId,
      tetikleyici_kodu: tetikleyiciKodu,
      kanal,
      alici_tipi: "personel",
      alici_id: authUser.id,
      alici_adres: aliciAdres,
      gonderilecek_metin: kural.mesaj_metni,
      test_mi: true,
      idempotency_anahtari: `test:${yetki.klinikId}:${tetikleyiciKodu}:${kanal}:${crypto.randomUUID()}`,
    })
    .select("id")
    .single();

  if (eklemeHata || !yeniSatir) {
    console.error("Test mesajı kuyruğa eklenemedi:", eklemeHata?.message);
    return { success: false, message: "Test gönderilemedi, lütfen tekrar deneyin." };
  }

  const sonuc = await kuyrukSatiriniIsle(admin, yeniSatir.id);

  revalidatePath("/panel/ayarlar/mesajlasma");
  revalidatePath(`/panel/ayarlar/mesajlasma/kredi/${kanal}`);

  return (KUYRUK_DURUM_MESAJI[sonuc.durum] ?? (() => ({ success: false, message: "Bilinmeyen durum." })))(
    aliciAdres,
    sonuc.hataMesaji
  );
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type SonucDurumu = { success: boolean; message: string } | null;

function bosIseNull(deger: FormDataEntryValue | null) {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

const bilgilerSemasi = z.object({
  cinsiyet: z.enum(["kadin", "erkek", "belirtilmemis"]).nullable(),
  eposta: z.string().trim().email("Geçersiz e-posta.").nullable(),
  referans_kanali: z.string().nullable(),
  kimlik_no: z.string().nullable(),
  kimlik_no_tipi: z.enum(["tc", "pasaport"]).nullable(),
  adres: z.string().nullable(),
  acil_durum_ad_soyad: z.string().nullable(),
  acil_durum_yakinlik: z.string().nullable(),
  acil_durum_telefon: z.string().nullable(),
  kronik_hastaliklar: z.string().nullable(),
  surekli_ilaclar: z.string().nullable(),
  alerjiler: z.string().nullable(),
  gecirilmis_ameliyatlar: z.string().nullable(),
  gelis_sebebi: z.string().nullable(),
  ticari_ileti_onay: z.coerce.boolean(),
  saglik_riza: z.coerce.boolean(),
});

async function musteriIdGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/giris");
  }

  const { data: mk } = await supabase
    .from("musteri_kullanici")
    .select("musteri_id")
    .eq("id", user.id)
    .single();

  return { supabase, musteriId: mk?.musteri_id ?? null };
}

export async function bilgileriGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, musteriId } = await musteriIdGetir();
  if (!musteriId) {
    return { success: false, message: "Müşteri bilgisi bulunamadı." };
  }

  const ayristirma = bilgilerSemasi.safeParse({
    cinsiyet: bosIseNull(formData.get("cinsiyet")),
    eposta: bosIseNull(formData.get("eposta")),
    referans_kanali: bosIseNull(formData.get("referans_kanali")),
    kimlik_no: bosIseNull(formData.get("kimlik_no")),
    kimlik_no_tipi: bosIseNull(formData.get("kimlik_no_tipi")),
    adres: bosIseNull(formData.get("adres")),
    acil_durum_ad_soyad: bosIseNull(formData.get("acil_durum_ad_soyad")),
    acil_durum_yakinlik: bosIseNull(formData.get("acil_durum_yakinlik")),
    acil_durum_telefon: bosIseNull(formData.get("acil_durum_telefon")),
    kronik_hastaliklar: bosIseNull(formData.get("kronik_hastaliklar")),
    surekli_ilaclar: bosIseNull(formData.get("surekli_ilaclar")),
    alerjiler: bosIseNull(formData.get("alerjiler")),
    gecirilmis_ameliyatlar: bosIseNull(formData.get("gecirilmis_ameliyatlar")),
    gelis_sebebi: bosIseNull(formData.get("gelis_sebebi")),
    ticari_ileti_onay: formData.get("ticari_ileti_onay") === "on",
    saglik_riza: formData.get("saglik_riza") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const {
    cinsiyet,
    eposta,
    referans_kanali,
    kimlik_no,
    kimlik_no_tipi,
    adres,
    acil_durum_ad_soyad,
    acil_durum_yakinlik,
    acil_durum_telefon,
    kronik_hastaliklar,
    surekli_ilaclar,
    alerjiler,
    gecirilmis_ameliyatlar,
    gelis_sebebi,
    ticari_ileti_onay,
    saglik_riza,
  } = ayristirma.data;

  const { data: mevcutMusteri } = await supabase
    .from("musteri")
    .select("ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi")
    .eq("id", musteriId)
    .single();

  const saglikRizaVar = saglik_riza || Boolean(mevcutMusteri?.ozel_nitelikli_veri_onay_tarihi);

  const hassasKayit: Record<string, string | null> = {
    musteri_id: musteriId,
    kimlik_no,
    kimlik_no_tipi,
    adres,
    acil_durum_ad_soyad,
    acil_durum_yakinlik,
    acil_durum_telefon,
  };
  if (saglikRizaVar) {
    hassasKayit.kronik_hastaliklar = kronik_hastaliklar;
    hassasKayit.surekli_ilaclar = surekli_ilaclar;
    hassasKayit.alerjiler = alerjiler;
    hassasKayit.gecirilmis_ameliyatlar = gecirilmis_ameliyatlar;
    hassasKayit.gelis_sebebi = gelis_sebebi;
  }

  const [musteriSonucu, hassasSonucu] = await Promise.all([
    supabase
      .from("musteri")
      .update({
        cinsiyet,
        eposta,
        referans_kanali,
        ticari_ileti_onay_tarihi: ticari_ileti_onay
          ? mevcutMusteri?.ticari_ileti_onay_tarihi ?? new Date().toISOString()
          : null,
        ozel_nitelikli_veri_onay_tarihi: saglikRizaVar
          ? mevcutMusteri?.ozel_nitelikli_veri_onay_tarihi ?? new Date().toISOString()
          : mevcutMusteri?.ozel_nitelikli_veri_onay_tarihi ?? null,
      })
      .eq("id", musteriId),
    supabase.from("musteri_hassas").upsert(hassasKayit, { onConflict: "musteri_id" }),
  ]);

  if (musteriSonucu.error || hassasSonucu.error) {
    console.error("Bilgiler güncellenemedi:", musteriSonucu.error, hassasSonucu.error);
    return { success: false, message: "Bilgiler kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/portal/bilgilerim");

  if (!saglikRizaVar && (kronik_hastaliklar || surekli_ilaclar || alerjiler || gecirilmis_ameliyatlar || gelis_sebebi)) {
    return {
      success: true,
      message:
        "Diğer bilgiler kaydedildi; sağlık geçmişinizin kaydedilmesi için rıza kutucuğunu işaretlemeniz gerekiyor.",
    };
  }

  return { success: true, message: "Bilgileriniz kaydedildi." };
}

export async function portalCikisYap() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/portal/giris");
}

export async function iptalTalebiOlustur(randevuId: string): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/giris");
  }

  const { data: mk } = await supabase
    .from("musteri_kullanici")
    .select("musteri_id")
    .eq("id", user.id)
    .single();

  if (!mk?.musteri_id) {
    return { success: false, message: "Müşteri bilgisi bulunamadı." };
  }

  const { error } = await supabase.from("randevu_iptal_talebi").insert({
    randevu_id: randevuId,
    musteri_id: mk.musteri_id,
  });

  if (error) {
    console.error("İptal talebi oluşturulamadı:", error);
    if (error.code === "23505") {
      return { success: false, message: "Bu randevu için zaten bir talep gönderilmiş." };
    }
    return { success: false, message: "İptal talebi gönderilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/portal");
  return { success: true, message: "İptal talebiniz gönderildi, kliniğinizin onayı bekleniyor." };
}

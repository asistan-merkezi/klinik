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
  il: z.string().nullable(),
  ilce: z.string().nullable(),
  mahalle: z.string().nullable(),
  adres: z.string().nullable(),
  acil_durum_ad_soyad: z.string().nullable(),
  acil_durum_yakinlik: z.string().nullable(),
  acil_durum_telefon: z.string().nullable(),
  kronik_hastaliklar: z.string().nullable(),
  surekli_ilaclar: z.string().nullable(),
  alerjiler: z.string().nullable(),
  gecirilmis_ameliyatlar: z.string().nullable(),
  gelis_sebebi: z.string().nullable(),
  kan_sulandirici_kullanimi: z.coerce.boolean(),
  ticari_ileti_onay: z.coerce.boolean(),
  saglik_riza: z.coerce.boolean(),
});

async function hastaIdGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/giris");
  }

  const { data: mk } = await supabase
    .from("hasta_kullanici")
    .select("hasta_id")
    .eq("id", user.id)
    .single();

  return { supabase, hastaId: mk?.hasta_id ?? null };
}

export async function bilgileriGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, hastaId } = await hastaIdGetir();
  if (!hastaId) {
    return { success: false, message: "Hasta bilgisi bulunamadı." };
  }

  const ayristirma = bilgilerSemasi.safeParse({
    cinsiyet: bosIseNull(formData.get("cinsiyet")),
    eposta: bosIseNull(formData.get("eposta")),
    referans_kanali: bosIseNull(formData.get("referans_kanali")),
    kimlik_no: bosIseNull(formData.get("kimlik_no")),
    kimlik_no_tipi: bosIseNull(formData.get("kimlik_no_tipi")),
    il: bosIseNull(formData.get("adres_il")),
    ilce: bosIseNull(formData.get("adres_ilce")),
    mahalle: bosIseNull(formData.get("adres_mahalle")),
    adres: bosIseNull(formData.get("adres")),
    acil_durum_ad_soyad: bosIseNull(formData.get("acil_durum_ad_soyad")),
    acil_durum_yakinlik: bosIseNull(formData.get("acil_durum_yakinlik")),
    acil_durum_telefon: bosIseNull(formData.get("acil_durum_telefon")),
    kronik_hastaliklar: bosIseNull(formData.get("kronik_hastaliklar")),
    surekli_ilaclar: bosIseNull(formData.get("surekli_ilaclar")),
    alerjiler: bosIseNull(formData.get("alerjiler")),
    gecirilmis_ameliyatlar: bosIseNull(formData.get("gecirilmis_ameliyatlar")),
    gelis_sebebi: bosIseNull(formData.get("gelis_sebebi")),
    kan_sulandirici_kullanimi: formData.get("kan_sulandirici_kullanimi") === "on",
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
    il,
    ilce,
    mahalle,
    adres,
    acil_durum_ad_soyad,
    acil_durum_yakinlik,
    acil_durum_telefon,
    kronik_hastaliklar,
    surekli_ilaclar,
    alerjiler,
    gecirilmis_ameliyatlar,
    gelis_sebebi,
    kan_sulandirici_kullanimi,
    ticari_ileti_onay,
    saglik_riza,
  } = ayristirma.data;

  const { data: mevcutHasta } = await supabase
    .from("hasta")
    .select("ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi")
    .eq("id", hastaId)
    .single();

  const saglikRizaVar = saglik_riza || Boolean(mevcutHasta?.ozel_nitelikli_veri_onay_tarihi);
  // Onaylayan sadece bu onay İLK KEZ (daha önce personel tarafından verilmemişken)
  // hastanın kendisi tarafından verildiğinde 'hasta' olarak işaretlenir — personelin
  // daha önce kağıt formla aldığı bir onayın üzerine hastanın portaldan tekrar
  // "onaylıyorum" göndermesi mevcut onaylayan kaydını değiştirmez.
  const yeniTicariOnay = ticari_ileti_onay && !mevcutHasta?.ticari_ileti_onay_tarihi;
  const yeniSaglikRizasi = saglik_riza && !mevcutHasta?.ozel_nitelikli_veri_onay_tarihi;

  const hassasKayit: Record<string, string | boolean | null> = {
    hasta_id: hastaId,
    kimlik_no,
    kimlik_no_tipi,
    il,
    ilce,
    mahalle,
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
    hassasKayit.kan_sulandirici_kullanimi = kan_sulandirici_kullanimi;
  }

  const [hastaSonucu, hassasSonucu] = await Promise.all([
    supabase
      .from("hasta")
      .update({
        cinsiyet,
        eposta,
        referans_kanali,
        ticari_ileti_onay_tarihi: ticari_ileti_onay
          ? mevcutHasta?.ticari_ileti_onay_tarihi ?? new Date().toISOString()
          : null,
        ozel_nitelikli_veri_onay_tarihi: saglikRizaVar
          ? mevcutHasta?.ozel_nitelikli_veri_onay_tarihi ?? new Date().toISOString()
          : mevcutHasta?.ozel_nitelikli_veri_onay_tarihi ?? null,
        ...(yeniTicariOnay ? { ticari_ileti_onaylayan_tip: "hasta", ticari_ileti_onaylayan_kullanici_id: null } : {}),
        ...(yeniSaglikRizasi
          ? { ozel_nitelikli_onaylayan_tip: "hasta", ozel_nitelikli_onaylayan_kullanici_id: null }
          : {}),
      })
      .eq("id", hastaId),
    supabase.from("hasta_hassas").upsert(hassasKayit, { onConflict: "hasta_id" }),
  ]);

  if (hastaSonucu.error || hassasSonucu.error) {
    console.error("Bilgiler güncellenemedi:", hastaSonucu.error, hassasSonucu.error);
    return { success: false, message: "Bilgiler kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/portal/bilgilerim");

  if (
    !saglikRizaVar &&
    (kronik_hastaliklar || surekli_ilaclar || alerjiler || gecirilmis_ameliyatlar || gelis_sebebi || kan_sulandirici_kullanimi)
  ) {
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
    .from("hasta_kullanici")
    .select("hasta_id")
    .eq("id", user.id)
    .single();

  if (!mk?.hasta_id) {
    return { success: false, message: "Hasta bilgisi bulunamadı." };
  }

  const { error } = await supabase.from("randevu_iptal_talebi").insert({
    randevu_id: randevuId,
    hasta_id: mk.hasta_id,
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

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type SonucDurumu = { success: boolean; message: string } | null;

const kalemSemasi = z.object({
  tur: z.enum(["islem", "paket"]),
  ref_id: z.string().uuid(),
  miktar: z.coerce.number().int().min(1).optional(),
});

const satirSemasi = z.object({
  yontem: z.enum(["kredi_karti", "banka_havalesi", "nakit"]),
  tutar: z.coerce.number().positive(),
});

function jsonDizisiSemasi<T extends z.ZodTypeAny>(itemSemasi: T, bosMesaj: string) {
  return z
    .string()
    .transform((deger, ctx) => {
      try {
        return JSON.parse(deger);
      } catch {
        ctx.addIssue({ code: "custom", message: "Geçersiz veri formatı." });
        return z.NEVER;
      }
    })
    .pipe(z.array(itemSemasi).min(1, bosMesaj));
}

const odemeSemasi = z.object({
  iskonto_tutari: z.coerce.number().min(0, "İskonto 0'dan küçük olamaz."),
  faturali: z.coerce.boolean().optional(),
  aciklama: z.string().trim().optional(),
  kalemler_json: jsonDizisiSemasi(kalemSemasi, "En az bir ürün eklenmeli."),
  satirlar_json: jsonDizisiSemasi(satirSemasi, "En az bir ödeme satırı girilmeli."),
});

const HATA_MESAJLARI: Record<string, string> = {
  yetkisiz: "Bu işlem için yetkiniz yok.",
  musteri_bulunamadi: "Müşteri bulunamadı.",
  urun_bulunamadi: "Seçilen ürün bulunamadı veya pasif.",
  kalem_yok: "En az bir ürün eklenmeli.",
  iskonto_fazla: "İskonto tutarı toplam tutardan büyük olamaz.",
  odeme_tutari_uyusmuyor: "Ödeme satırları toplamı, ödenecek tutara eşit olmalı.",
};

function odemeHatasiniCevir(mesaj: string | undefined) {
  if (!mesaj) {
    return "Ödeme alınamadı, lütfen tekrar deneyin.";
  }
  for (const [anahtar, turkce] of Object.entries(HATA_MESAJLARI)) {
    if (mesaj.includes(anahtar)) {
      return turkce;
    }
  }
  return "Ödeme alınamadı, lütfen tekrar deneyin.";
}

export async function odemeAl(
  musteriId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const ayristirma = odemeSemasi.safeParse({
    iskonto_tutari: formData.get("iskonto_tutari") || 0,
    faturali: formData.get("faturali") === "on",
    aciklama: formData.get("aciklama") ?? "",
    kalemler_json: formData.get("kalemler_json") ?? "[]",
    satirlar_json: formData.get("satirlar_json") ?? "[]",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { iskonto_tutari, faturali, aciklama, kalemler_json, satirlar_json } = ayristirma.data;

  const { error } = await supabase.rpc("odeme_olustur", {
    p_musteri_id: musteriId,
    p_iskonto_tutari: iskonto_tutari,
    p_faturali: faturali ?? false,
    p_aciklama: aciklama ? aciklama : null,
    p_kalemler: kalemler_json,
    p_satirlar: satirlar_json,
  });

  if (error) {
    console.error("Ödeme oluşturulamadı:", error);
    return { success: false, message: odemeHatasiniCevir(error.message) };
  }

  revalidatePath(`/panel/musteriler/${musteriId}`);
  return { success: true, message: "Ödeme alındı." };
}

export async function faturaTetikle(faturaId: string): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (
    kullanici?.rol !== "klinik_admin" &&
    kullanici?.rol !== "resepsiyon" &&
    kullanici?.rol !== "muhasebe"
  ) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { data: fatura } = await supabase.from("fatura").select("id").eq("id", faturaId).single();
  if (!fatura) {
    return { success: false, message: "Fatura bulunamadı." };
  }

  const { data: entegrasyon } = await supabase
    .from("klinik_muhasebe_entegrasyonu")
    .select("baglanti_durumu")
    .maybeSingle();

  if (entegrasyon?.baglanti_durumu !== "baglandi") {
    return {
      success: false,
      message: "Muhasebe Sync henüz bağlı değil. Ayarlar > Muhasebe Sync'ten Paraşüt bilgilerini girin.",
    };
  }

  // Kimlik bilgisi girilmiş olsa da gerçek Paraşüt API client'ı henüz yazılmadı
  // (bkz. CLAUDE.md — resmi API dokümantasyonu bu ortamdan doğrulanamadı);
  // fatura durumu "bekliyor" kalır, otomatik/varsayılan bir yeniden deneme
  // yapılmaz (accounting-sync kuralı).
  return {
    success: false,
    message: "Muhasebe Sync bağlı ama Paraşüt API entegrasyonu henüz yazılmadı, fatura otomatik kesilemiyor.",
  };
}

type PortalSonucu = { success: boolean; message: string; geciciSifre?: string } | null;

function geciciSifreUret(): string {
  let sifre = "";
  for (let i = 0; i < 6; i++) {
    sifre += Math.floor(Math.random() * 10).toString();
  }
  return sifre;
}

async function yetkiliMusteriGetir(musteriId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (kullanici?.rol !== "klinik_admin" && kullanici?.rol !== "resepsiyon") {
    return { supabase, musteri: null, yetkisiz: true as const };
  }

  // RLS klinik_id = current_klinik_id() ile sınırlar; sonuç dönerse müşteri kendi kliniğindendir.
  const { data: musteri } = await supabase.from("musteri").select("id").eq("id", musteriId).single();

  return { supabase, musteri, yetkisiz: false as const };
}

export async function portalErisimiAc(musteriId: string): Promise<PortalSonucu> {
  const { musteri, yetkisiz } = await yetkiliMusteriGetir(musteriId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!musteri) {
    return { success: false, message: "Müşteri bulunamadı." };
  }

  const adminClient = createAdminClient();
  const geciciSifre = geciciSifreUret();
  const eposta = `m-${musteri.id}@portal.local`;

  const { data: yeniKullanici, error: createError } = await adminClient.auth.admin.createUser({
    email: eposta,
    password: geciciSifre,
    email_confirm: true,
  });

  if (createError || !yeniKullanici.user) {
    console.error("Portal kullanıcısı oluşturulamadı:", createError);
    return { success: false, message: "Portal erişimi açılamadı, lütfen tekrar deneyin." };
  }

  const { error: insertError } = await adminClient
    .from("musteri_kullanici")
    .insert({ id: yeniKullanici.user.id, musteri_id: musteri.id });

  if (insertError) {
    console.error("musteri_kullanici eklenemedi:", insertError);
    await adminClient.auth.admin.deleteUser(yeniKullanici.user.id);
    return { success: false, message: "Portal erişimi açılamadı, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/musteriler/${musteriId}`);
  return { success: true, message: "Portal erişimi açıldı.", geciciSifre };
}

export async function portalSifreSifirla(musteriId: string): Promise<PortalSonucu> {
  const { supabase, musteri, yetkisiz } = await yetkiliMusteriGetir(musteriId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!musteri) {
    return { success: false, message: "Müşteri bulunamadı." };
  }

  const { data: mk } = await supabase
    .from("musteri_kullanici")
    .select("id")
    .eq("musteri_id", musteriId)
    .single();

  if (!mk) {
    return { success: false, message: "Portal erişimi bulunamadı." };
  }

  const adminClient = createAdminClient();
  const geciciSifre = geciciSifreUret();
  const { error } = await adminClient.auth.admin.updateUserById(mk.id, { password: geciciSifre });

  if (error) {
    console.error("Portal şifresi sıfırlanamadı:", error);
    return { success: false, message: "Şifre sıfırlanamadı, lütfen tekrar deneyin." };
  }

  return { success: true, message: "Yeni geçici şifre oluşturuldu.", geciciSifre };
}

function bosIseNull2(deger: FormDataEntryValue | null) {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

const evetHayirSemasi = z
  .union([z.literal("evet"), z.literal("hayir"), z.literal("")])
  .optional()
  .transform((deger) => (deger === "evet" ? true : deger === "hayir" ? false : null));

const detayliSemasi = z.object({
  cinsiyet: z.enum(["kadin", "erkek", "belirtilmemis"]).nullable(),
  eposta: z.string().trim().email("Geçersiz e-posta.").nullable(),
  referans_kanali: z.string().nullable(),
  kimlik_no: z.string().nullable(),
  kimlik_no_tipi: z.enum(["tc", "pasaport"]).nullable(),
  adres: z.string().nullable(),
  acil_durum_ad_soyad: z.string().nullable(),
  acil_durum_yakinlik: z.string().nullable(),
  acil_durum_telefon: z.string().nullable(),

  alerji_var: evetHayirSemasi,
  alerjiler: z.string().nullable(),
  kan_sulandirici_kullanimi: evetHayirSemasi,
  kan_sulandirici_detay: z.string().nullable(),
  kronik_hastalik_var: evetHayirSemasi,
  kronik_hastaliklar: z.string().nullable(),
  surekli_ilac_var: evetHayirSemasi,
  surekli_ilaclar: z.string().nullable(),
  ameliyat_var: evetHayirSemasi,
  gecirilmis_ameliyatlar: z.string().nullable(),
  bulasici_hastalik_var: evetHayirSemasi,
  bulasici_hastalik_detay: z.string().nullable(),
  protez_implant_var: evetHayirSemasi,
  protez_implant_detay: z.string().nullable(),
  hamilelik_emzirme_var: evetHayirSemasi,
  hamilelik_emzirme_detay: z.string().nullable(),
  sigara_alkol_madde_var: evetHayirSemasi,
  sigara_alkol_madde_detay: z.string().nullable(),

  gelis_sebebi: z.string().nullable(),
  oncelik_durumu: z.enum(["normal", "oncelikli", "acil"]),
});

export async function detayliBilgileriGuncelle(
  musteriId: string,
  _onceki: PortalSonucu,
  formData: FormData
): Promise<PortalSonucu> {
  const { supabase, musteri, yetkisiz } = await yetkiliMusteriGetir(musteriId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!musteri) {
    return { success: false, message: "Müşteri bulunamadı." };
  }

  const ayristirma = detayliSemasi.safeParse({
    cinsiyet: bosIseNull2(formData.get("cinsiyet")),
    eposta: bosIseNull2(formData.get("eposta")),
    referans_kanali: bosIseNull2(formData.get("referans_kanali")),
    kimlik_no: bosIseNull2(formData.get("kimlik_no")),
    kimlik_no_tipi: bosIseNull2(formData.get("kimlik_no_tipi")),
    adres: bosIseNull2(formData.get("adres")),
    acil_durum_ad_soyad: bosIseNull2(formData.get("acil_durum_ad_soyad")),
    acil_durum_yakinlik: bosIseNull2(formData.get("acil_durum_yakinlik")),
    acil_durum_telefon: bosIseNull2(formData.get("acil_durum_telefon")),

    alerji_var: formData.get("alerji_var") ?? "",
    alerjiler: bosIseNull2(formData.get("alerjiler")),
    kan_sulandirici_kullanimi: formData.get("kan_sulandirici_kullanimi") ?? "",
    kan_sulandirici_detay: bosIseNull2(formData.get("kan_sulandirici_detay")),
    kronik_hastalik_var: formData.get("kronik_hastalik_var") ?? "",
    kronik_hastaliklar: bosIseNull2(formData.get("kronik_hastaliklar")),
    surekli_ilac_var: formData.get("surekli_ilac_var") ?? "",
    surekli_ilaclar: bosIseNull2(formData.get("surekli_ilaclar")),
    ameliyat_var: formData.get("ameliyat_var") ?? "",
    gecirilmis_ameliyatlar: bosIseNull2(formData.get("gecirilmis_ameliyatlar")),
    bulasici_hastalik_var: formData.get("bulasici_hastalik_var") ?? "",
    bulasici_hastalik_detay: bosIseNull2(formData.get("bulasici_hastalik_detay")),
    protez_implant_var: formData.get("protez_implant_var") ?? "",
    protez_implant_detay: bosIseNull2(formData.get("protez_implant_detay")),
    hamilelik_emzirme_var: formData.get("hamilelik_emzirme_var") ?? "",
    hamilelik_emzirme_detay: bosIseNull2(formData.get("hamilelik_emzirme_detay")),
    sigara_alkol_madde_var: formData.get("sigara_alkol_madde_var") ?? "",
    sigara_alkol_madde_detay: bosIseNull2(formData.get("sigara_alkol_madde_detay")),

    gelis_sebebi: bosIseNull2(formData.get("gelis_sebebi")),
    oncelik_durumu: formData.get("oncelik_durumu") || "normal",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { cinsiyet, eposta, referans_kanali, ...hassas } = ayristirma.data;

  const [musteriSonucu, hassasSonucu] = await Promise.all([
    supabase.from("musteri").update({ cinsiyet, eposta, referans_kanali }).eq("id", musteriId),
    supabase.from("musteri_hassas").upsert({ musteri_id: musteriId, ...hassas }, { onConflict: "musteri_id" }),
  ]);

  if (musteriSonucu.error || hassasSonucu.error) {
    console.error("Detaylı bilgiler güncellenemedi:", musteriSonucu.error, hassasSonucu.error);
    if (hassasSonucu.error?.code === "23505") {
      return { success: false, message: "Bu kimlik no başka bir müşteride kayıtlı." };
    }
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/musteriler/${musteriId}`);
  return { success: true, message: "Detaylı bilgiler kaydedildi." };
}

export async function ozelNitelikliOnayVer(musteriId: string): Promise<PortalSonucu> {
  const { supabase, musteri, yetkisiz } = await yetkiliMusteriGetir(musteriId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!musteri) {
    return { success: false, message: "Müşteri bulunamadı." };
  }

  const { error } = await supabase
    .from("musteri")
    .update({ ozel_nitelikli_veri_onay_tarihi: new Date().toISOString() })
    .eq("id", musteriId);

  if (error) {
    console.error("Özel nitelikli veri onayı kaydedilemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/musteriler/${musteriId}`);
  return { success: true, message: "Sağlık verisi işleme onayı kaydedildi." };
}

export async function portalErisimDurumDegistir(musteriId: string, yeniDurum: boolean): Promise<PortalSonucu> {
  const { supabase, musteri, yetkisiz } = await yetkiliMusteriGetir(musteriId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!musteri) {
    return { success: false, message: "Müşteri bulunamadı." };
  }

  const { error } = await supabase
    .from("musteri_kullanici")
    .update({ aktif: yeniDurum })
    .eq("musteri_id", musteriId);

  if (error) {
    console.error("Portal erişim durumu güncellenemedi:", error);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/musteriler/${musteriId}`);
  return { success: true, message: yeniDurum ? "Portal erişimi açıldı." : "Portal erişimi kapatıldı." };
}

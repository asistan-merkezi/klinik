"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isimBasHarfBuyukYap } from "@/lib/utils";

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
  hasta_bulunamadi: "Hasta bulunamadı.",
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
  hastaId: string,
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
    p_hasta_id: hastaId,
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

  revalidatePath(`/panel/hastalar/${hastaId}`);
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

async function yetkiliHastaGetir(hastaId: string) {
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
    return { supabase, hasta: null, yetkisiz: true as const };
  }

  // RLS klinik_id = current_klinik_id() ile sınırlar; sonuç dönerse hasta kendi kliniğindendir.
  const { data: hasta } = await supabase.from("hasta").select("id").eq("id", hastaId).single();

  return { supabase, hasta, yetkisiz: false as const };
}

export async function portalErisimiAc(hastaId: string): Promise<PortalSonucu> {
  const { hasta, yetkisiz } = await yetkiliHastaGetir(hastaId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const adminClient = createAdminClient();
  const geciciSifre = geciciSifreUret();
  const eposta = `m-${hasta.id}@portal.local`;

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
    .from("hasta_kullanici")
    .insert({ id: yeniKullanici.user.id, hasta_id: hasta.id });

  if (insertError) {
    console.error("hasta_kullanici eklenemedi:", insertError);
    await adminClient.auth.admin.deleteUser(yeniKullanici.user.id);
    return { success: false, message: "Portal erişimi açılamadı, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/hastalar/${hastaId}`);
  return { success: true, message: "Portal erişimi açıldı.", geciciSifre };
}

export async function portalSifreSifirla(hastaId: string): Promise<PortalSonucu> {
  const { supabase, hasta, yetkisiz } = await yetkiliHastaGetir(hastaId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const { data: mk } = await supabase
    .from("hasta_kullanici")
    .select("id")
    .eq("hasta_id", hastaId)
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

// NOT (kimlik_no uzunluğu): T.C. Kimlik No 11 hane kontrolü kasıtlı olarak
// burada YOK (sadece client'ta uyarı gösteriliyor, bkz. detayli-bilgiler-karti.tsx).
// Daha önce burada bir superRefine ile sert reddediliyordu, ama üretimde 11
// haneden farklı (10 haneli) kimlik_no ile kayıtlı gerçek hastalar var (bu
// alan eklendiğinde henüz uzunluk kontrolü yoktu) — o hastalarda formun
// HİÇBİR alanı kaydedilemiyordu, kullanıcı kimlik_no alanına hiç dokunmasa
// bile. "Eksik/fazla girilirse uyarılsın" isteği zaten sadece uyarı
// istiyordu, reddetme değil.
//
// NOT (form ikiye ayrıldı): Kimlik/İletişim/Adres/Acil Durum/Veli ile
// Tıbbi Ön Geçmiş (anamnez) tek bir formda birleşikken ciddi bir hata vardı:
// hasta.telefon her submit'te (dokunulmasa bile) "+90..." formatına yeniden
// yazılıyordu, bu da terapist için hasta.telefon'u DEĞİŞTİRİYOR sayılıp
// hasta_terapist_sadece_risk_guncelle trigger'ını (terapist sadece
// risk_bayraklari değiştirebilir) tetikliyor ve TÜM formu (anamnez dahil)
// reddediyordu. Artık iki ayrı action/form var: temelBilgileriGuncelle
// (klinik_admin/resepsiyon-only, hasta tablosu + kimlik/adres/veli) ve
// anamnezGuncelle (terapist + klinik_admin/resepsiyon, sadece anamnez
// alanları, hasta tablosuna hiç dokunmuyor). Aynı ayrım DB'de de
// hasta_hassas_terapist_kisitla trigger'ıyla (migration 20260731100000)
// garanti altına alındı.

const temelBilgilerSemasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  telefon: z.string().regex(/^\+90\d{10}$/, "Telefon numarası (başındaki 0 hariç) 10 haneli olmalı."),
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
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
  anne_adi: z.string().nullable(),
  anne_telefon: z.string().nullable(),
  baba_adi: z.string().nullable(),
  baba_telefon: z.string().nullable(),
  diger_yakini_ad_soyad: z.string().nullable(),
  diger_yakini_telefon: z.string().nullable(),
  diger_yakini_yakinlik: z.string().nullable(),
});

export async function temelBilgileriGuncelle(
  hastaId: string,
  _onceki: PortalSonucu,
  formData: FormData
): Promise<PortalSonucu> {
  // Kimlik/iletişim/adres/veli idari veridir — sadece klinik_admin/resepsiyon.
  const { supabase, hasta, yetkisiz } = await yetkiliHastaGetir(hastaId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const ayristirma = temelBilgilerSemasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    cinsiyet: bosIseNull2(formData.get("cinsiyet")),
    eposta: bosIseNull2(formData.get("eposta")),
    referans_kanali: bosIseNull2(formData.get("referans_kanali")),
    kimlik_no: bosIseNull2(formData.get("kimlik_no")),
    kimlik_no_tipi: bosIseNull2(formData.get("kimlik_no_tipi")),
    il: bosIseNull2(formData.get("adres_il")),
    ilce: bosIseNull2(formData.get("adres_ilce")),
    mahalle: bosIseNull2(formData.get("adres_mahalle")),
    adres: bosIseNull2(formData.get("adres")),
    acil_durum_ad_soyad: bosIseNull2(formData.get("acil_durum_ad_soyad")),
    acil_durum_yakinlik: bosIseNull2(formData.get("acil_durum_yakinlik")),
    acil_durum_telefon: bosIseNull2(formData.get("acil_durum_telefon")),
    anne_adi: bosIseNull2(formData.get("anne_adi")),
    anne_telefon: bosIseNull2(formData.get("anne_telefon")),
    baba_adi: bosIseNull2(formData.get("baba_adi")),
    baba_telefon: bosIseNull2(formData.get("baba_telefon")),
    diger_yakini_ad_soyad: bosIseNull2(formData.get("diger_yakini_ad_soyad")),
    diger_yakini_telefon: bosIseNull2(formData.get("diger_yakini_telefon")),
    diger_yakini_yakinlik: bosIseNull2(formData.get("diger_yakini_yakinlik")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad_soyad, telefon, dogum_tarihi, cinsiyet, eposta, referans_kanali, anne_adi, baba_adi, diger_yakini_ad_soyad, ...digerHassas } =
    ayristirma.data;

  const [hastaSonucu, hassasSonucu] = await Promise.all([
    supabase
      .from("hasta")
      .update({
        ad_soyad: isimBasHarfBuyukYap(ad_soyad),
        telefon,
        dogum_tarihi: dogum_tarihi ? dogum_tarihi : null,
        cinsiyet,
        eposta,
        referans_kanali,
      })
      .eq("id", hastaId),
    supabase.from("hasta_hassas").upsert(
      {
        hasta_id: hastaId,
        ...digerHassas,
        anne_adi: anne_adi ? isimBasHarfBuyukYap(anne_adi) : null,
        baba_adi: baba_adi ? isimBasHarfBuyukYap(baba_adi) : null,
        diger_yakini_ad_soyad: diger_yakini_ad_soyad ? isimBasHarfBuyukYap(diger_yakini_ad_soyad) : null,
      },
      { onConflict: "hasta_id" }
    ),
  ]);

  if (hastaSonucu.error || hassasSonucu.error) {
    console.error("Temel bilgiler güncellenemedi:", hastaSonucu.error, hassasSonucu.error);
    if (hassasSonucu.error?.code === "23505") {
      return { success: false, message: "Bu kimlik no başka bir hastada kayıtlı." };
    }
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/hastalar/${hastaId}`);
  revalidatePath("/panel/hastalar");
  revalidatePath("/panel/randevular");
  return { success: true, message: "Temel bilgiler kaydedildi." };
}

const anamnezSemasi = z.object({
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

export async function anamnezGuncelle(
  hastaId: string,
  _onceki: PortalSonucu,
  formData: FormData
): Promise<PortalSonucu> {
  // Anamnez klinik/tedavi içeriğidir — terapist de düzenleyebilir (klinik_admin/
  // resepsiyon'un yanı sıra). Bu action hasta tablosuna HİÇ dokunmuyor ve
  // hasta_hassas'a sadece anamnez alanlarını yazıyor (bkz. yukarıdaki not).
  const { supabase, hasta, yetkisiz } = await terapistDahilYetkiliHastaGetir(hastaId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const ayristirma = anamnezSemasi.safeParse({
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

  const { error } = await supabase
    .from("hasta_hassas")
    .upsert({ hasta_id: hastaId, ...ayristirma.data }, { onConflict: "hasta_id" });

  if (error) {
    console.error("Anamnez güncellenemedi:", error);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/hastalar/${hastaId}`);
  return { success: true, message: "Tıbbi geçmiş kaydedildi." };
}

export async function ozelNitelikliOnayVer(hastaId: string): Promise<PortalSonucu> {
  const { supabase, hasta, yetkisiz } = await yetkiliHastaGetir(hastaId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const { error } = await supabase
    .from("hasta")
    .update({ ozel_nitelikli_veri_onay_tarihi: new Date().toISOString() })
    .eq("id", hastaId);

  if (error) {
    console.error("Özel nitelikli veri onayı kaydedilemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/hastalar/${hastaId}`);
  return { success: true, message: "Sağlık verisi işleme onayı kaydedildi." };
}

const riskBayragiSemasi = z.object({
  tip: z.enum([
    "alerji",
    "kalp_pili",
    "kan_sulandirici",
    "dusme_riski",
    "hamilelik",
    "diyabet",
    "epilepsi",
    "metal_implant",
    "diger",
  ]),
  aciklama: z.string().trim().min(1, "Açıklama gerekli."),
  seviye: z.enum(["yuksek", "orta", "dusuk"]),
});

async function terapistDahilYetkiliHastaGetir(hastaId: string) {
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

  if (!kullanici || !["klinik_admin", "resepsiyon", "terapist"].includes(kullanici.rol)) {
    return { supabase, userId: user.id, hasta: null, yetkisiz: true as const };
  }

  const { data: hasta } = await supabase
    .from("hasta")
    .select("id, risk_bayraklari")
    .eq("id", hastaId)
    .single();

  return { supabase, userId: user.id, hasta, yetkisiz: false as const };
}

export async function riskBayragiEkle(
  hastaId: string,
  _onceki: PortalSonucu,
  formData: FormData
): Promise<PortalSonucu> {
  const { supabase, userId, hasta, yetkisiz } = await terapistDahilYetkiliHastaGetir(hastaId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const ayristirma = riskBayragiSemasi.safeParse({
    tip: formData.get("tip"),
    aciklama: formData.get("aciklama"),
    seviye: formData.get("seviye"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const mevcutBayraklar = Array.isArray(hasta.risk_bayraklari) ? hasta.risk_bayraklari : [];
  const yeniBayrak = {
    ...ayristirma.data,
    eklenme_tarihi: new Date().toISOString(),
    ekleyen_id: userId,
  };

  const { error } = await supabase
    .from("hasta")
    .update({ risk_bayraklari: [...mevcutBayraklar, yeniBayrak] })
    .eq("id", hastaId);

  if (error) {
    console.error("Risk bayrağı eklenemedi:", error);
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/hastalar/${hastaId}`);
  return { success: true, message: "Risk bayrağı eklendi." };
}

const hedefSemasi = z.object({
  hedef_tipi: z.enum(["vas", "rom", "fonksiyonel", "serbest"]),
  hedef_metrik: z.string().trim().min(1, "Hedef metriği gerekli."),
  baslangic_deger: z.coerce.number().nullable(),
  hedef_deger: z.coerce.number().nullable(),
  hedef_tarihi: z.string().trim().nullable(),
  notlar: z.string().trim().nullable(),
});

export async function hastaHedefEkle(
  hastaId: string,
  _onceki: PortalSonucu,
  formData: FormData
): Promise<PortalSonucu> {
  const { supabase, userId, hasta, yetkisiz } = await terapistDahilYetkiliHastaGetir(hastaId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const bosIseNull = (deger: FormDataEntryValue | null) => {
    if (deger == null) return null;
    const s = String(deger).trim();
    return s === "" ? null : s;
  };

  const ayristirma = hedefSemasi.safeParse({
    hedef_tipi: formData.get("hedef_tipi"),
    hedef_metrik: formData.get("hedef_metrik"),
    baslangic_deger: bosIseNull(formData.get("baslangic_deger")),
    hedef_deger: bosIseNull(formData.get("hedef_deger")),
    hedef_tarihi: bosIseNull(formData.get("hedef_tarihi")),
    notlar: bosIseNull(formData.get("notlar")),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase.from("hasta_hedef").insert({
    hasta_id: hastaId,
    olusturan_id: userId,
    ...ayristirma.data,
  });

  if (error) {
    console.error("Hedef eklenemedi:", error);
    return { success: false, message: "Eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/hastalar/${hastaId}`);
  return { success: true, message: "Hedef eklendi." };
}

export async function belgeSignedUrlAl(belgeId: string): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  // hasta_belge_goruntule RPC'si audit_log'a 'select' satırı yazar ve yetki
  // kontrolünü kendi içinde yapar (Postgres'te SELECT trigger olmadığı için
  // bu görüntüleme logu buradan yazılıyor — bkz. migration 20260729100000).
  const { data: belge, error: rpcError } = await supabase
    .rpc("hasta_belge_goruntule", { p_id: belgeId })
    .single<{ storage_path: string }>();

  if (rpcError || !belge) {
    return { error: "Belge bulunamadı veya erişim yetkiniz yok." };
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("hasta-belge")
    .createSignedUrl(belge.storage_path, 300);

  if (signError || !signed) {
    console.error("Signed URL üretilemedi:", signError);
    return { error: "Görüntüleme bağlantısı oluşturulamadı." };
  }

  return { url: signed.signedUrl };
}

export async function portalErisimDurumDegistir(hastaId: string, yeniDurum: boolean): Promise<PortalSonucu> {
  const { supabase, hasta, yetkisiz } = await yetkiliHastaGetir(hastaId);
  if (yetkisiz) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }
  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const { error } = await supabase
    .from("hasta_kullanici")
    .update({ aktif: yeniDurum })
    .eq("hasta_id", hastaId);

  if (error) {
    console.error("Portal erişim durumu güncellenemedi:", error);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath(`/panel/hastalar/${hastaId}`);
  return { success: true, message: yeniDurum ? "Portal erişimi açıldı." : "Portal erişimi kapatıldı." };
}

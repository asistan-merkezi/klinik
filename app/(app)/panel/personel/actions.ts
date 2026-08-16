"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tcKimlikGecerliMi } from "@/lib/tc-kimlik";
import { bugunTarih } from "@/lib/puantaj";
import { formatTime, toUTC } from "@/lib/datetime";

type SonucDurumu = { success: boolean; message: string; geciciSifre?: string } | null;

const KARAKTER_HAVUZU = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function geciciSifreUret(): string {
  let sifre = "";
  for (let i = 0; i < 10; i++) {
    sifre += KARAKTER_HAVUZU[Math.floor(Math.random() * KARAKTER_HAVUZU.length)];
  }
  return sifre;
}

function yasHesapla(dogumTarihi: Date): number {
  const bugun = new Date();
  let yas = bugun.getFullYear() - dogumTarihi.getFullYear();
  const ayFarki = bugun.getMonth() - dogumTarihi.getMonth();
  if (ayFarki < 0 || (ayFarki === 0 && bugun.getDate() < dogumTarihi.getDate())) {
    yas--;
  }
  return yas;
}

async function yetkiliKlinikAdminGetir() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();

  // Not: super_admin (platform yöneticisi) burada bilinçli olarak yok — bu rolün
  // kullanici.klinik_id'si NULL'dur (bkz. kullanici_klinik_gerekli CHECK) ve
  // projede super_admin'in "belirli bir kliniğin paneli içinde o klinik adına"
  // işlem yapabildiği bir akış/klinik-seçici henüz kurulmadı. RPC/RLS
  // katmanındaki is_super_admin() bypass'ları (audit_log'lu) bu ihtiyaç
  // doğduğunda zaten devrede; sayfa/action seviyesi yetki burada klinik_admin
  // ile sınırlı tutuldu.
  if (!kullanici || kullanici.rol !== "klinik_admin" || !kullanici.klinik_id) {
    return { supabase, klinikId: null as string | null, userId: user.id, yetkisiz: true as const };
  }

  return { supabase, klinikId: kullanici.klinik_id, userId: user.id, yetkisiz: false as const };
}

// ---------------------------------------------------------------------
// Ortak şema: Kişisel/İş/Sistem Yetki adımları
// ---------------------------------------------------------------------
const dogumTarihiSemasi = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((deger) => {
    if (!deger) return true;
    const tarih = new Date(deger);
    if (Number.isNaN(tarih.getTime())) return false;
    const yas = yasHesapla(tarih);
    return yas >= 18 && yas <= 100;
  }, "Doğum tarihi geçerli bir aralıkta olmalı (18-100 yaş arası).");

const kisiselIsSemasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  dogum_tarihi: dogumTarihiSemasi,
  dogum_yeri: z.string().trim().optional().or(z.literal("")),
  cinsiyet: z.enum(["erkek", "kadin", "belirtilmemis"]).optional().or(z.literal("")),
  gsm: z
    .string()
    .trim()
    .min(7, "GSM numarası geçersiz.")
    .max(20, "GSM numarası geçersiz.")
    .regex(/^[0-9+ ]+$/, "GSM sadece rakam, boşluk ve + içerebilir."),
  il: z.string().trim().optional().or(z.literal("")),
  ilce: z.string().trim().optional().or(z.literal("")),
  mahalle: z.string().trim().optional().or(z.literal("")),
  adres: z.string().trim().optional().or(z.literal("")),
  acil_ad_soyad: z.string().trim().optional().or(z.literal("")),
  acil_yakinlik: z.string().trim().optional().or(z.literal("")),
  acil_telefon: z.string().trim().optional().or(z.literal("")),
  unvan: z.string().trim().min(2, "Unvan/branş en az 2 karakter olmalı."),
  departman: z.string().trim().optional().or(z.literal("")),
  ise_giris_tarihi: z.string().trim().optional().or(z.literal("")),
  calisma_tipi: z.enum(["tam_zamanli", "yari_zamanli", "vardiyali", "prim_usulu"]).optional().or(z.literal("")),
  sgk_sicil_no: z.string().trim().optional().or(z.literal("")),
  uzmanlik_tescil_no: z.string().trim().optional().or(z.literal("")),
  rol: z.enum(["klinik_admin", "resepsiyon", "terapist", "muhasebe"]),
  tc_kimlik_no: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((deger) => !deger || tcKimlikGecerliMi(deger), "T.C. Kimlik No geçersiz."),
  pasaport_no: z.string().trim().optional().or(z.literal("")),
  // Mesleki belgeler (sadece rol=terapist ise anlamlı; formda o durumda gösterilir)
  diploma_no: z.string().trim().optional().or(z.literal("")),
  uzmanlik_belge_no: z.string().trim().optional().or(z.literal("")),
  meslek_odasi_sicil_no: z.string().trim().optional().or(z.literal("")),
  saglik_bakanligi_tescil_no: z.string().trim().optional().or(z.literal("")),
  e_imza_sertifika_seri_no: z.string().trim().optional().or(z.literal("")),
  e_imza_gecerlilik_tarihi: z.string().trim().optional().or(z.literal("")),
  sigorta_police_no: z.string().trim().optional().or(z.literal("")),
  sigorta_bitis_tarihi: z.string().trim().optional().or(z.literal("")),
}).refine(
  (v) => {
    const dolu = [v.acil_ad_soyad, v.acil_yakinlik, v.acil_telefon].filter((d) => d);
    return dolu.length === 0 || dolu.length === 3;
  },
  { message: "Acil durum kişisi için ad soyad, yakınlık ve telefon birlikte girilmeli.", path: ["acil_ad_soyad"] }
);

function formVerisiTopla(formData: FormData) {
  return {
    ad_soyad: formData.get("ad_soyad"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    dogum_yeri: formData.get("dogum_yeri") ?? "",
    cinsiyet: formData.get("cinsiyet") ?? "",
    gsm: formData.get("gsm"),
    il: formData.get("adres_il") ?? "",
    ilce: formData.get("adres_ilce") ?? "",
    mahalle: formData.get("adres_mahalle") ?? "",
    adres: formData.get("adres") ?? "",
    acil_ad_soyad: formData.get("acil_ad_soyad") ?? "",
    acil_yakinlik: formData.get("acil_yakinlik") ?? "",
    acil_telefon: formData.get("acil_telefon") ?? "",
    unvan: formData.get("unvan"),
    departman: formData.get("departman") ?? "",
    ise_giris_tarihi: formData.get("ise_giris_tarihi") ?? "",
    calisma_tipi: formData.get("calisma_tipi") ?? "",
    sgk_sicil_no: formData.get("sgk_sicil_no") ?? "",
    uzmanlik_tescil_no: formData.get("uzmanlik_tescil_no") ?? "",
    rol: formData.get("rol"),
    tc_kimlik_no: formData.get("tc_kimlik_no") ?? "",
    pasaport_no: formData.get("pasaport_no") ?? "",
    diploma_no: formData.get("diploma_no") ?? "",
    uzmanlik_belge_no: formData.get("uzmanlik_belge_no") ?? "",
    meslek_odasi_sicil_no: formData.get("meslek_odasi_sicil_no") ?? "",
    saglik_bakanligi_tescil_no: formData.get("saglik_bakanligi_tescil_no") ?? "",
    e_imza_sertifika_seri_no: formData.get("e_imza_sertifika_seri_no") ?? "",
    e_imza_gecerlilik_tarihi: formData.get("e_imza_gecerlilik_tarihi") ?? "",
    sigorta_police_no: formData.get("sigorta_police_no") ?? "",
    sigorta_bitis_tarihi: formData.get("sigorta_bitis_tarihi") ?? "",
  };
}

type FormVerisi = z.infer<typeof kisiselIsSemasi>;

// Acil kişi + hassas (TC/pasaport, şifreli RPC üzerinden) + mesleki belge +
// kaşe görseli — hem oluşturma hem düzenlemede aynı mantık, tek yerde.
async function yardimciKayitlariIsle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminClient: ReturnType<typeof createAdminClient>,
  personelId: string,
  veri: FormVerisi,
  kaseDosyasi: File | null,
  klinikId: string
): Promise<string | null> {
  // Acil durum kişisi: tek satır — varsa güncelle, yoksa ekle.
  if (veri.acil_ad_soyad && veri.acil_yakinlik && veri.acil_telefon) {
    const { data: mevcut } = await adminClient
      .from("personel_acil_kisi")
      .select("id")
      .eq("personel_id", personelId)
      .maybeSingle();

    if (mevcut) {
      await adminClient
        .from("personel_acil_kisi")
        .update({ ad_soyad: veri.acil_ad_soyad, yakinlik: veri.acil_yakinlik, telefon: veri.acil_telefon })
        .eq("id", mevcut.id);
    } else {
      await adminClient.from("personel_acil_kisi").insert({
        personel_id: personelId,
        ad_soyad: veri.acil_ad_soyad,
        yakinlik: veri.acil_yakinlik,
        telefon: veri.acil_telefon,
      });
    }
  }

  // Hassas (TC kimlik/pasaport) — SADECE çağıranın kendi oturumuyla (RPC
  // içinde auth.uid()/current_rol() kontrolü var; service-role admin client
  // ile çağrılırsa auth.uid() boş döner ve 'yetkisiz' hatası alınır).
  let uyari: string | null = null;
  if (veri.tc_kimlik_no || veri.pasaport_no) {
    const { error: hassasError } = await supabase.rpc("personel_hassas_kaydet", {
      p_personel_id: personelId,
      p_tc_kimlik: veri.tc_kimlik_no || null,
      p_pasaport: veri.pasaport_no || null,
    });
    if (hassasError) {
      console.error("personel_hassas_kaydet başarısız:", hassasError);
      uyari =
        hassasError.message === "sifreleme_anahtari_kurulu_degil"
          ? "T.C. Kimlik/Pasaport kaydedilemedi: şifreleme anahtarı henüz kurulmadı, sistem yöneticinize başvurun."
          : "T.C. Kimlik/Pasaport kaydedilemedi, lütfen tekrar deneyin.";
    }
  }

  // Mesleki belgeler — sadece terapist rolünde anlamlı.
  if (
    veri.rol === "terapist" &&
    (veri.diploma_no ||
      veri.uzmanlik_belge_no ||
      veri.meslek_odasi_sicil_no ||
      veri.saglik_bakanligi_tescil_no ||
      veri.e_imza_sertifika_seri_no ||
      veri.sigorta_police_no ||
      kaseDosyasi)
  ) {
    let kaseYolu: string | null = null;
    if (kaseDosyasi && kaseDosyasi.size > 0) {
      const uzanti = kaseDosyasi.name.split(".").pop() || "png";
      const yol = `${klinikId}/${personelId}/kase.${uzanti}`;
      const { error: yuklemeHatasi } = await adminClient.storage
        .from("personel-belge")
        .upload(yol, kaseDosyasi, { upsert: true, contentType: kaseDosyasi.type });
      if (yuklemeHatasi) {
        console.error("Kaşe görseli yüklenemedi:", yuklemeHatasi);
      } else {
        kaseYolu = yol;
      }
    }

    const { data: mevcutBelge } = await adminClient
      .from("personel_mesleki_belge")
      .select("personel_id, kase_gorsel_url")
      .eq("personel_id", personelId)
      .maybeSingle();

    const satir = {
      diploma_no: veri.diploma_no || null,
      uzmanlik_belge_no: veri.uzmanlik_belge_no || null,
      meslek_odasi_sicil_no: veri.meslek_odasi_sicil_no || null,
      saglik_bakanligi_tescil_no: veri.saglik_bakanligi_tescil_no || null,
      e_imza_sertifika_seri_no: veri.e_imza_sertifika_seri_no || null,
      e_imza_gecerlilik_tarihi: veri.e_imza_gecerlilik_tarihi || null,
      kase_gorsel_url: kaseYolu ?? mevcutBelge?.kase_gorsel_url ?? null,
      mali_sorumluluk_sigorta_police_no: veri.sigorta_police_no || null,
      mali_sorumluluk_sigorta_bitis_tarihi: veri.sigorta_bitis_tarihi || null,
    };

    if (mevcutBelge) {
      await adminClient.from("personel_mesleki_belge").update(satir).eq("personel_id", personelId);
    } else {
      await adminClient.from("personel_mesleki_belge").insert({ personel_id: personelId, ...satir });
    }
  }

  return uyari;
}

export async function personelHesabiOlustur(
  basvuruId: string | null,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, userId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  // "Olumlu" ile açılan aktarım akışı — aynı başvuru iki kez "aktarılamaz"
  // (çift personel/hesap oluşmasın diye, sayfa arka planda revalidate
  // olmadan iki kez tıklanırsa diye erken kontrol).
  if (basvuruId) {
    const { data: basvuru } = await supabase
      .from("is_basvurusu")
      .select("id, klinik_id, durum, personel_id")
      .eq("id", basvuruId)
      .single();

    if (!basvuru || basvuru.klinik_id !== klinikId) {
      return { success: false, message: "Başvuru bulunamadı." };
    }
    if (basvuru.personel_id) {
      return { success: false, message: "Bu başvuru zaten bir personele aktarılmış." };
    }
  }

  const eposta = formData.get("eposta");
  const ayristirma = kisiselIsSemasi.safeParse(formVerisiTopla(formData));

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  if (typeof eposta !== "string" || !eposta.trim() || !eposta.includes("@")) {
    return { success: false, message: "Geçersiz kurumsal e-posta." };
  }

  const veri = ayristirma.data;
  const kaseDosyasi = formData.get("kase_dosya");

  const adminClient = createAdminClient();
  const geciciSifre = geciciSifreUret();

  const { data: yeniKullanici, error: createError } = await adminClient.auth.admin.createUser({
    email: eposta.trim(),
    password: geciciSifre,
    email_confirm: true,
  });

  if (createError || !yeniKullanici.user) {
    console.error("Personel auth hesabı oluşturulamadı:", createError);
    if (createError?.code === "email_exists") {
      return { success: false, message: "Bu e-posta adresi zaten kullanılıyor." };
    }
    return { success: false, message: "Hesap oluşturulamadı, lütfen tekrar deneyin." };
  }

  const { error: kullaniciError } = await adminClient.from("kullanici").insert({
    id: yeniKullanici.user.id,
    klinik_id: klinikId,
    rol: veri.rol,
    ad_soyad: veri.ad_soyad,
    telefon: veri.gsm,
  });

  if (kullaniciError) {
    console.error("kullanici eklenemedi:", kullaniciError);
    await adminClient.auth.admin.deleteUser(yeniKullanici.user.id);
    return { success: false, message: "Hesap oluşturulamadı, lütfen tekrar deneyin." };
  }

  const { data: yeniPersonel, error: personelError } = await adminClient
    .from("personel")
    .insert({
      klinik_id: klinikId,
      kullanici_id: yeniKullanici.user.id,
      ad_soyad: veri.ad_soyad,
      gorev: veri.unvan,
      dogum_tarihi: veri.dogum_tarihi || null,
      dogum_yeri: veri.dogum_yeri || null,
      cinsiyet: veri.cinsiyet || null,
      eposta: eposta.trim(),
      departman: veri.departman || null,
      calisma_tipi: veri.calisma_tipi || null,
      sgk_sicil_no: veri.sgk_sicil_no || null,
      ise_giris_tarihi: veri.ise_giris_tarihi || null,
      uzmanlik_tescil_no: veri.uzmanlik_tescil_no || null,
      il: veri.il || null,
      ilce: veri.ilce || null,
      mahalle: veri.mahalle || null,
      adres: veri.adres || null,
      aktif: true,
    })
    .select("id")
    .single();

  if (personelError || !yeniPersonel) {
    console.error("personel eklenemedi:", personelError);
    await adminClient.from("kullanici").delete().eq("id", yeniKullanici.user.id);
    await adminClient.auth.admin.deleteUser(yeniKullanici.user.id);
    return { success: false, message: "Hesap oluşturulamadı, lütfen tekrar deneyin." };
  }

  // Başvurudan aktarılıyorsa personel oluşur oluşmaz bağla — bundan sonra
  // (terapist alt kaydı veya yardımcı kayıtlar başarısız olsa bile) aynı
  // başvurudan ikinci bir personel oluşturulamaz (yukarıdaki erken kontrol).
  if (basvuruId) {
    const { error: basvuruError } = await adminClient
      .from("is_basvurusu")
      .update({
        durum: "olumlu",
        personel_id: yeniPersonel.id,
        degerlendiren_kullanici_id: userId,
        degerlendirme_tarihi: new Date().toISOString(),
      })
      .eq("id", basvuruId);
    if (basvuruError) {
      console.error("is_basvurusu personele bağlanamadı:", basvuruError);
    }
  }

  if (veri.rol === "terapist") {
    const { error: terapistError } = await adminClient.from("terapist").insert({
      klinik_id: klinikId,
      personel_id: yeniPersonel.id,
    });

    if (terapistError) {
      console.error("terapist eklenemedi:", terapistError);
      // personel/kullanici zaten oluştu; terapist alt kaydı elle tekrar denenebilir,
      // tüm hesabı geri almak (personel geçmişi varsa) riskli olur.
      return {
        success: true,
        message: "Hesap oluşturuldu ama terapist ayarları kaydedilemedi, lütfen tekrar deneyin.",
        geciciSifre,
      };
    }
  }

  const uyari = await yardimciKayitlariIsle(
    supabase,
    adminClient,
    yeniPersonel.id,
    veri,
    kaseDosyasi instanceof File ? kaseDosyasi : null,
    klinikId
  );

  revalidatePath("/panel/personel");
  if (basvuruId) revalidatePath("/panel/personel/basvurular");
  return {
    success: true,
    message: uyari ? `Personel hesabı oluşturuldu. ${uyari}` : "Personel hesabı oluşturuldu.",
    geciciSifre,
  };
}

export async function personelBilgileriGuncelle(
  personelId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { data: mevcutPersonel } = await supabase
    .from("personel")
    .select("id, kullanici_id, klinik_id")
    .eq("id", personelId)
    .single();

  if (!mevcutPersonel || mevcutPersonel.klinik_id !== klinikId) {
    return { success: false, message: "Personel bulunamadı." };
  }

  const ayristirma = kisiselIsSemasi.safeParse(formVerisiTopla(formData));
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const veri = ayristirma.data;
  const kaseDosyasi = formData.get("kase_dosya");

  const adminClient = createAdminClient();

  const { error: personelError } = await adminClient
    .from("personel")
    .update({
      ad_soyad: veri.ad_soyad,
      gorev: veri.unvan,
      dogum_tarihi: veri.dogum_tarihi || null,
      dogum_yeri: veri.dogum_yeri || null,
      cinsiyet: veri.cinsiyet || null,
      departman: veri.departman || null,
      calisma_tipi: veri.calisma_tipi || null,
      sgk_sicil_no: veri.sgk_sicil_no || null,
      ise_giris_tarihi: veri.ise_giris_tarihi || null,
      uzmanlik_tescil_no: veri.uzmanlik_tescil_no || null,
      il: veri.il || null,
      ilce: veri.ilce || null,
      mahalle: veri.mahalle || null,
      adres: veri.adres || null,
    })
    .eq("id", personelId);

  if (personelError) {
    console.error("personel güncellenemedi:", personelError);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  if (mevcutPersonel.kullanici_id) {
    await adminClient
      .from("kullanici")
      .update({ ad_soyad: veri.ad_soyad, telefon: veri.gsm, rol: veri.rol })
      .eq("id", mevcutPersonel.kullanici_id);
  }

  const uyari = await yardimciKayitlariIsle(
    supabase,
    adminClient,
    personelId,
    veri,
    kaseDosyasi instanceof File ? kaseDosyasi : null,
    klinikId
  );

  revalidatePath(`/panel/personel/${personelId}`);
  revalidatePath("/panel/personel");
  return { success: true, message: uyari ? `Kaydedildi. ${uyari}` : "Kaydedildi." };
}

/**
 * Personel Listesi kutucuklarındaki Giriş/Çıkış — kart üzerinde önce o anki
 * saat gösterilir (kullanıcı "Onayla" veya "Düzenle" ile değiştirebilir),
 * onaylanan saat bugünün personel_puantaj satırına yazılır (sayfa değiştirmeden).
 * Çalışma Çizelgesi'ndeki gunKaydet ile aynı RLS/yetki sınırı (klinik_admin) —
 * personel_puantaj INSERT/UPDATE policy'leri zaten sadece admin'e açık, burada
 * ayrıca uygulama katmanında da erken reddediliyor. Var olan bir saati asla
 * sessizce ezmiyor (yanlışlıkla iki kez tıklanırsa mevcut kayıt korunur, admin
 * düzeltmek isterse Çalışma Çizelgesi'nden elle değiştirir).
 */
export async function hizliPuantajKaydet(
  personelId: string,
  tur: "giris" | "cikis",
  saat: string
): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  if (!/^\d{2}:\d{2}$/.test(saat)) {
    return { success: false, message: "Saat geçersiz." };
  }

  const tarih = bugunTarih();
  const zamanIso = toUTC(`${tarih}T${saat}:00`);

  const { data: mevcut } = await supabase
    .from("personel_puantaj")
    .select("id, giris_saat, cikis_saat")
    .eq("personel_id", personelId)
    .eq("tarih", tarih)
    .maybeSingle();

  let hata;

  if (tur === "giris") {
    if (mevcut?.giris_saat) {
      return { success: false, message: `Bugün için giriş zaten kaydedilmiş (${formatTime(mevcut.giris_saat)}).` };
    }
    if (mevcut) {
      ({ error: hata } = await supabase
        .from("personel_puantaj")
        .update({ giris_saat: zamanIso })
        .eq("id", mevcut.id));
    } else {
      ({ error: hata } = await supabase
        .from("personel_puantaj")
        .insert({ personel_id: personelId, tarih, giris_saat: zamanIso }));
    }
  } else {
    if (!mevcut?.giris_saat) {
      return { success: false, message: "Önce giriş kaydedilmeli." };
    }
    if (mevcut.cikis_saat) {
      return { success: false, message: `Bugün için çıkış zaten kaydedilmiş (${formatTime(mevcut.cikis_saat)}).` };
    }
    ({ error: hata } = await supabase
      .from("personel_puantaj")
      .update({ cikis_saat: zamanIso })
      .eq("id", mevcut.id));
  }

  if (hata) {
    console.error("Hızlı puantaj kaydedilemedi:", hata);
    if (hata.code === "23514") {
      return { success: false, message: "Çıkış saati giriş saatinden önce olamaz." };
    }
    if (hata.code === "42501" || hata.message?.includes("row-level security")) {
      return { success: false, message: "Bu ay dönemi kapalı olduğu için kaydedilemiyor." };
    }
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel/puantaj-cetveli");
  revalidatePath("/panel/personel");
  return {
    success: true,
    message: tur === "giris" ? `Giriş kaydedildi (${saat}).` : `Çıkış kaydedildi (${saat}).`,
  };
}

// ---------------------------------------------------------------------
// Pozisyonlar (Blok 3b)
// ---------------------------------------------------------------------
const pozisyonSemasi = z.object({
  grup: z.string().trim().min(1, "Grup zorunlu."),
  sira: z.coerce.number().int().default(0),
  sistem_erisimi: z.coerce.boolean(),
  varsayilan_rol: z.enum(["klinik_admin", "resepsiyon", "terapist", "muhasebe"]),
  ucret_tipi: z.enum(["aylik_maas", "prim_usulu"]),
  puantaj_modu: z.enum(["gunluk", "esnek", "takipsiz"]),
});

export async function pozisyonGuncelle(pozisyonId: string, _onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = pozisyonSemasi.safeParse({
    grup: formData.get("grup"),
    sira: formData.get("sira") || 0,
    sistem_erisimi: formData.get("sistem_erisimi") === "on",
    varsayilan_rol: formData.get("varsayilan_rol"),
    ucret_tipi: formData.get("ucret_tipi"),
    puantaj_modu: formData.get("puantaj_modu"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase
    .from("pozisyonlar")
    .update(ayristirma.data)
    .eq("id", pozisyonId)
    .eq("klinik_id", klinikId);

  if (error) {
    console.error("Pozisyon güncellenemedi:", error);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel");
  return { success: true, message: "Pozisyon güncellendi." };
}

export async function pozisyonAktifDurumDegistir(pozisyonId: string, yeniDurum: boolean): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase
    .from("pozisyonlar")
    .update({ aktif: yeniDurum })
    .eq("id", pozisyonId)
    .eq("klinik_id", klinikId);

  if (error) {
    console.error("Pozisyon durumu değiştirilemedi:", error);
    const mesaj =
      error.message?.includes("pozisyon_personel_bagli")
        ? "Bu pozisyonda hâlâ aktif personel var — önce onları başka bir pozisyona taşıyın."
        : "Değiştirilemedi, lütfen tekrar deneyin.";
    return { success: false, message: mesaj };
  }

  revalidatePath("/panel/personel");
  return { success: true, message: yeniDurum ? "Pozisyon aktifleştirildi." : "Pozisyon pasife alındı." };
}

const ozelPozisyonSemasi = pozisyonSemasi.extend({
  ad: z.string().trim().min(1, "Pozisyon adı zorunlu."),
});

export async function ozelPozisyonOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { supabase, klinikId, yetkisiz } = await yetkiliKlinikAdminGetir();
  if (yetkisiz || !klinikId) {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const ayristirma = ozelPozisyonSemasi.safeParse({
    ad: formData.get("ad"),
    grup: formData.get("grup") || "Diğer",
    sira: 999,
    sistem_erisimi: formData.get("sistem_erisimi") === "on",
    varsayilan_rol: formData.get("varsayilan_rol"),
    ucret_tipi: formData.get("ucret_tipi"),
    puantaj_modu: formData.get("puantaj_modu"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase.from("pozisyonlar").insert({
    klinik_id: klinikId,
    ozel_mi: true,
    ...ayristirma.data,
  });

  if (error) {
    console.error("Özel pozisyon oluşturulamadı:", error);
    if (error.code === "23505") {
      return { success: false, message: "Bu isimde bir pozisyon zaten var." };
    }
    return { success: false, message: "Oluşturulamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel");
  return { success: true, message: "Özel pozisyon eklendi." };
}

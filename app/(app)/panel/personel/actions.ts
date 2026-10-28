"use server";

import { createHash } from "node:crypto";
import { havaleHesapEksikMi, HAVALE_HESAP_GEREKLI_MESAJI } from "@/lib/finans/banka-hesabi-kurali";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, count, eq, gte, inArray, ne } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant, type Tx } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { hesabiDevreDisiBirak, hesabiYenidenEtkinlestir, kimlikBilgisiGuncelle, kimlikHesabiSil, personelHesabiOlustur as kimlikPersonelHesabiOlustur } from "@/lib/auth/hesap";
import { dosyaYaz } from "@/lib/dosya/depo";
import { icerikTipiDogrula } from "@/lib/dosya/imza";
import { islemAnahtariniKaydet, islemAnahtariniOku } from "@/lib/finans/idempotans";
import { pozitifTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import { tcKimlikGecerliMi } from "@/lib/tc-kimlik";
import { bugunTarih } from "@/lib/puantaj";
import { formatTime, toUTC } from "@/lib/datetime";

// `uyari: true`, success olsa da mesajda kullanıcının GÖRMESİ gereken bir
// kısmi hata var demektir (ör. T.C. Kimlik kaydedilemedi) — çağıran taraf bu
// durumda dialog'u otomatik KAPATMAMALI, aksi halde uyarı okunmadan kaybolur.
type SonucDurumu = { success: boolean; message: string; geciciSifre?: string; uyari?: boolean } | null;

const KASE_TURLERI: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const KASE_MAX_BYTE = 5 * 1024 * 1024;
const UUID = z.string().uuid();

function yasHesapla(dogumTarihi: Date): number {
  const bugun = new Date();
  let yas = bugun.getFullYear() - dogumTarihi.getFullYear();
  const ayFarki = bugun.getMonth() - dogumTarihi.getMonth();
  if (ayFarki < 0 || (ayFarki === 0 && bugun.getDate() < dogumTarihi.getDate())) {
    yas--;
  }
  return yas;
}

/**
 * Personel yönetimi yalnız klinik_admin. super_admin bilinçli olarak yok: klinik bağlamı (tenant) taşımaz ve projede "belirli bir kliniğin
 * paneli içinde o klinik adına" işlem akışı kurulmadı (RPC/RLS'teki is_super_admin bypass'ları audit'lidir, ihtiyaç doğunca devreye girer).
 */
async function adminOturumu() {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") return null;
  return { bag: y.bag, klinikId: y.klinikId, kullaniciId: y.ctx.userId };
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
  pozisyon_id: z.string().trim().min(1, "Pozisyon seçilmeli."),
  departman: z.string().trim().optional().or(z.literal("")),
  ise_giris_tarihi: z.string().trim().optional().or(z.literal("")),
  isten_cikis_tarihi: z.string().trim().optional().or(z.literal("")),
  calisma_tipi: z.enum(["tam_zamanli", "yari_zamanli", "vardiyali", "prim_usulu"]).optional().or(z.literal("")),
  sgk_sicil_no: z.string().trim().optional().or(z.literal("")),
  imza_yetkilisi_mi: z.string().trim().optional().or(z.literal("")),
  egitim_json: z.string().trim().optional().or(z.literal("")),
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
    pozisyon_id: formData.get("pozisyon_id"),
    departman: formData.get("departman") ?? "",
    ise_giris_tarihi: formData.get("ise_giris_tarihi") ?? "",
    isten_cikis_tarihi: formData.get("isten_cikis_tarihi") ?? "",
    calisma_tipi: formData.get("calisma_tipi") ?? "",
    sgk_sicil_no: formData.get("sgk_sicil_no") ?? "",
    imza_yetkilisi_mi: formData.get("imza_yetkilisi_mi") ?? "",
    egitim_json: formData.get("egitim_json") ?? "",
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

type EgitimSatiri = { derece: string | null; okul: string | null; bolum: string | null; yil: string | null };

// Formdaki dinamik "+ Yeni Eğitim Ekle" satırları tek bir gizli input'ta
// JSON olarak taşınıyor — burada ayrıştırılıp temizleniyor. Tamamen boş satırlar atılır.
function egitimSatirlariniAyristir(json: string): EgitimSatiri[] {
  if (!json) return [];
  let ham: unknown;
  try {
    ham = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(ham)) return [];
  return ham
    .slice(0, 20)
    .map((satir): EgitimSatiri => {
      const s = satir as Record<string, unknown>;
      const temizle = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return { derece: temizle(s?.derece), okul: temizle(s?.okul), bolum: temizle(s?.bolum), yil: temizle(s?.yil) };
    })
    .filter((satir) => satir.derece || satir.okul || satir.bolum || satir.yil);
}

/** Kaşe görseli: tür/boyut/dosya imzası doğrulanır, DOSYA_KOKU/personel-belge/<klinik>/<personel>/kase.<uzantı> altına yazılır. Dönüş: kayıtlı yol veya hata. */
async function kaseKaydet(klinikId: string, personelId: string, dosya: File): Promise<{ yol: string } | { hata: string }> {
  const uzanti = KASE_TURLERI[dosya.type];
  if (!uzanti) return { hata: "Kaşe görseli yalnız PNG, JPG veya WEBP olabilir." };
  if (dosya.size > KASE_MAX_BYTE) return { hata: "Kaşe görseli en fazla 5 MB olabilir." };
  const veri = Buffer.from(await dosya.arrayBuffer());
  if (!icerikTipiDogrula(dosya.type, veri)) return { hata: "Kaşe görseli içeriği dosya türüyle uyuşmuyor." };
  const parcalar = [klinikId, personelId, `kase.${uzanti}`];
  try {
    await dosyaYaz("personel-belge", parcalar, veri);
  } catch (e) {
    console.error("Kaşe görseli yüklenemedi:", e instanceof Error ? e.message : e);
    return { hata: "Kaşe görseli yüklenemedi." };
  }
  return { yol: parcalar.join("/") };
}

// Acil kişi + eğitim + hassas (TC/pasaport, RPC — düz metin, RLS ile izole) + mesleki belge + kaşe — hem oluşturma hem düzenlemede aynı mantık.
// Çağıranın transaction'ında çalışır; "kısmi hata" olabilecek adımlar (hassas) savepoint'tedir, transaction'ı bozmaz ve uyarı döndürür.
async function yardimciKayitlariIsle(tx: Tx, klinikId: string, personelId: string, veri: FormVerisi, kaseDosyasi: File | null): Promise<string | null> {
  // Acil durum kişisi: tek satır — varsa güncelle, yoksa ekle.
  if (veri.acil_ad_soyad && veri.acil_yakinlik && veri.acil_telefon) {
    const mevcut = (await tx.select({ id: sema.personelAcilKisi.id }).from(sema.personelAcilKisi).where(eq(sema.personelAcilKisi.personelId, personelId)).limit(1))[0];
    const deger = { adSoyad: veri.acil_ad_soyad, yakinlik: veri.acil_yakinlik, telefon: veri.acil_telefon };
    if (mevcut) await tx.update(sema.personelAcilKisi).set(deger).where(eq(sema.personelAcilKisi.id, mevcut.id));
    else await tx.insert(sema.personelAcilKisi).values({ personelId, ...deger });
  }

  // Eğitim Bilgileri (çoklu) — sadece terapist rolünde anlamlı. Diff yerine sil + yeniden yaz (liste küçük).
  if (veri.rol === "terapist") {
    const satirlar = egitimSatirlariniAyristir(veri.egitim_json ?? "");
    await tx.delete(sema.personelEgitim).where(eq(sema.personelEgitim.personelId, personelId));
    if (satirlar.length > 0) await tx.insert(sema.personelEgitim).values(satirlar.map((s) => ({ personelId, ...s })));
  }

  // Hassas (TC kimlik/pasaport) — RPC içinde rol + tenant kontrolü var; benzersizlik ihlali vb. yalnız uyarı üretir.
  let uyari: string | null = null;
  if (veri.tc_kimlik_no || veri.pasaport_no) {
    try {
      await tx.transaction((s) => rpc(s, "personel_hassas_kaydet", { p_personel_id: personelId, p_tc_kimlik: veri.tc_kimlik_no || null, p_pasaport: veri.pasaport_no || null }));
    } catch (e) {
      console.error("personel_hassas_kaydet başarısız:", pgHata(e).mesaj);
      uyari = "T.C. Kimlik/Pasaport kaydedilemedi, lütfen tekrar deneyin.";
    }
  }

  // Mesleki belgeler — sadece terapist rolünde anlamlı.
  if (
    veri.rol === "terapist" &&
    (veri.diploma_no || veri.uzmanlik_belge_no || veri.meslek_odasi_sicil_no || veri.saglik_bakanligi_tescil_no || veri.e_imza_sertifika_seri_no || veri.sigorta_police_no || kaseDosyasi)
  ) {
    let kaseYolu: string | null = null;
    if (kaseDosyasi && kaseDosyasi.size > 0) {
      const k = await kaseKaydet(klinikId, personelId, kaseDosyasi);
      if ("yol" in k) kaseYolu = k.yol;
      else uyari = [uyari, k.hata].filter(Boolean).join(" ");
    }

    const mevcut = (await tx.select({ kase: sema.personelMeslekiBelge.kaseGorselUrl }).from(sema.personelMeslekiBelge).where(eq(sema.personelMeslekiBelge.personelId, personelId)).limit(1))[0];
    const satir = {
      diplomaNo: veri.diploma_no || null,
      uzmanlikBelgeNo: veri.uzmanlik_belge_no || null,
      meslekOdasiSicilNo: veri.meslek_odasi_sicil_no || null,
      saglikBakanligiTescilNo: veri.saglik_bakanligi_tescil_no || null,
      eImzaSertifikaSeriNo: veri.e_imza_sertifika_seri_no || null,
      eImzaGecerlilikTarihi: veri.e_imza_gecerlilik_tarihi || null,
      kaseGorselUrl: kaseYolu ?? mevcut?.kase ?? null,
      maliSorumlulukSigortaPoliceNo: veri.sigorta_police_no || null,
      maliSorumlulukSigortaBitisTarihi: veri.sigorta_bitis_tarihi || null,
    };
    if (mevcut) await tx.update(sema.personelMeslekiBelge).set(satir).where(eq(sema.personelMeslekiBelge.personelId, personelId));
    else await tx.insert(sema.personelMeslekiBelge).values({ personelId, ...satir });
  }

  return uyari;
}

export async function personelHesabiOlustur(
  basvuruId: string | null,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (basvuruId !== null && !UUID.safeParse(basvuruId).success) return { success: false, message: "Başvuru bulunamadı." };

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

  // Ön kontroller (yazmadan): başvuru aktarılmış mı + pozisyon geçerli mi. "Olumlu" ile açılan aktarım akışında aynı başvuru iki kez aktarılamaz.
  const onKontrol = await withTenant(o.bag, async (tx) => {
    if (basvuruId) {
      const b = (await tx.select({ klinikId: sema.isBasvurusu.klinikId, personelId: sema.isBasvurusu.personelId }).from(sema.isBasvurusu).where(eq(sema.isBasvurusu.id, basvuruId)).limit(1))[0];
      if (!b || b.klinikId !== o.klinikId) return "Başvuru bulunamadı.";
      if (b.personelId) return "Bu başvuru zaten bir personele aktarılmış.";
    }
    const poz = UUID.safeParse(veri.pozisyon_id).success
      ? (await tx.select({ id: sema.pozisyonlar.id, ad: sema.pozisyonlar.ad, aktif: sema.pozisyonlar.aktif }).from(sema.pozisyonlar).where(and(eq(sema.pozisyonlar.id, veri.pozisyon_id), eq(sema.pozisyonlar.klinikId, o.klinikId))).limit(1))[0]
      : undefined;
    if (!poz || !poz.aktif) return "Seçilen pozisyon bulunamadı ya da pasif.";
    return { pozisyonId: poz.id, pozisyonAd: poz.ad };
  });
  if (typeof onKontrol === "string") return { success: false, message: onKontrol };

  // 1) Kimlik hesabı (ayrı havuz). Tenant yazımı düşerse kimlik hesabı geri silinir.
  let hesap;
  try {
    hesap = await kimlikPersonelHesabiOlustur({ eposta: eposta.trim(), ad: veri.ad_soyad, telefon: veri.gsm, rol: veri.rol, klinikId: o.klinikId });
  } catch (e) {
    const h = pgHata(e);
    console.error("Personel kimlik hesabı oluşturulamadı:", h.mesaj);
    if (h.kod === "23505") return { success: false, message: "Bu e-posta adresi veya telefon zaten kullanılıyor." };
    return { success: false, message: "Hesap oluşturulamadı, lütfen tekrar deneyin." };
  }

  // 2) Tenant tarafı TEK transaction: kullanici + personel + başvuru bağlantısı + terapist + yardımcı kayıtlar. Çekirdek adım düşerse hepsi geri alınır.
  let uyari: string | null = null;
  let personelId: string;
  try {
    personelId = await withTenant(o.bag, async (tx) => {
      await tx.insert(sema.kullanici).values({ id: hesap.id, klinikId: o.klinikId, rol: veri.rol, adSoyad: veri.ad_soyad, telefon: veri.gsm });
      const [yeni] = await tx
        .insert(sema.personel)
        .values({
          klinikId: o.klinikId,
          kullaniciId: hesap.id,
          adSoyad: veri.ad_soyad,
          gorev: onKontrol.pozisyonAd,
          pozisyonId: onKontrol.pozisyonId,
          dogumTarihi: veri.dogum_tarihi || null,
          dogumYeri: veri.dogum_yeri || null,
          cinsiyet: veri.cinsiyet || null,
          eposta: eposta.trim(),
          departman: veri.departman || null,
          calismaTipi: veri.calisma_tipi || null,
          sgkSicilNo: veri.sgk_sicil_no || null,
          iseGirisTarihi: veri.ise_giris_tarihi || null,
          istenCikisTarihi: veri.isten_cikis_tarihi || null,
          imzaYetkilisiMi: veri.imza_yetkilisi_mi === "on",
          il: veri.il || null,
          ilce: veri.ilce || null,
          mahalle: veri.mahalle || null,
          adres: veri.adres || null,
          aktif: true,
        })
        .returning({ id: sema.personel.id });

      // Başvurudan aktarılıyorsa personel oluşur oluşmaz bağla (aynı başvurudan ikinci personel oluşamaz). Eşzamanlı çift aktarım: koşullu güncelleme.
      if (basvuruId) {
        const g = await tx
          .update(sema.isBasvurusu)
          .set({ durum: "olumlu", personelId: yeni.id, degerlendirenKullaniciId: o.kullaniciId, degerlendirmeTarihi: new Date().toISOString() })
          .where(and(eq(sema.isBasvurusu.id, basvuruId), eq(sema.isBasvurusu.klinikId, o.klinikId)))
          .returning({ eski: sema.isBasvurusu.personelId });
        if (g.length === 0) throw new Error("basvuru_bulunamadi");
      }

      if (veri.rol === "terapist") {
        await tx.insert(sema.terapist).values({ klinikId: o.klinikId, personelId: yeni.id });
      }

      uyari = await yardimciKayitlariIsle(tx, o.klinikId, yeni.id, veri, kaseDosyasi instanceof File ? kaseDosyasi : null);
      return yeni.id;
    });
  } catch (e) {
    console.error("personel tenant kaydı başarısız:", pgHata(e).mesaj);
    await kimlikHesabiSil(hesap.id).catch((x) => console.error("Kimlik hesabı geri alınamadı:", x));
    return { success: false, message: "Hesap oluşturulamadı, lütfen tekrar deneyin." };
  }
  void personelId;

  revalidatePath("/panel/personel");
  revalidatePath("/panel/ayarlar/personel-tanimlama");
  if (basvuruId) revalidatePath("/panel/personel/basvurular");
  return {
    success: true,
    message: uyari ? `Personel hesabı oluşturuldu. ${uyari}` : "Personel hesabı oluşturuldu.",
    geciciSifre: hesap.geciciSifre,
    uyari: Boolean(uyari),
  };
}

export async function personelBilgileriGuncelle(
  personelId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(personelId).success) return { success: false, message: "Personel bulunamadı." };

  const ayristirma = kisiselIsSemasi.safeParse(formVerisiTopla(formData));
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const veri = ayristirma.data;
  const kaseDosyasi = formData.get("kase_dosya");

  // İşten çıkış tarihi girilince (boştan doluya geçince), bir giriş hesabı varsa kimlik hesabı DEVRE DIŞI bırakılır ve AÇIK OTURUMLAR iptal edilir
  // (hemen etkili). Tarih sonradan temizlenirse (yanlışlık/yeniden işe alım) hesap yeniden etkinleştirilir. Bilinçli olarak `personel.aktif`'e
  // DOKUNULMUYOR: o alan Puantaj Cetveli + otomatik dönem kapama işinin kimi işleyeceğini belirliyor — çıkış girilir girilmez aktif=false yapmak
  // kişinin son (kısmi) ayının hakedişinin kapanmamasına yol açardı.
  let eskiCikisVarMi = false;
  let kullaniciId: string | null = null;
  let uyariListesi: string | null = null;
  let randevuUyarisi: string | null = null;

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      const mevcut = (
        await tx
          .select({ id: sema.personel.id, kullaniciId: sema.personel.kullaniciId, klinikId: sema.personel.klinikId, pozisyonId: sema.personel.pozisyonId, istenCikis: sema.personel.istenCikisTarihi })
          .from(sema.personel)
          .where(eq(sema.personel.id, personelId))
          .limit(1)
      )[0];
      if (!mevcut || mevcut.klinikId !== o.klinikId) return "Personel bulunamadı.";
      kullaniciId = mevcut.kullaniciId;
      eskiCikisVarMi = Boolean(mevcut.istenCikis);

      const poz = UUID.safeParse(veri.pozisyon_id).success
        ? (await tx.select({ id: sema.pozisyonlar.id, ad: sema.pozisyonlar.ad, aktif: sema.pozisyonlar.aktif }).from(sema.pozisyonlar).where(and(eq(sema.pozisyonlar.id, veri.pozisyon_id), eq(sema.pozisyonlar.klinikId, o.klinikId))).limit(1))[0]
        : undefined;
      // Mevcut atanmış pozisyon değişmiyorsa pasif olsa bile kabul edilir (pasif personelin bağlı olduğu pozisyon pasife alınabiliyor).
      const pozisyonDegismiyor = poz?.id === mevcut.pozisyonId;
      if (!poz || (!poz.aktif && !pozisyonDegismiyor)) return "Seçilen pozisyon bulunamadı ya da pasif.";

      // Klinikteki son yönetici kendi rolünü düşüremesin — yoksa kimse yönetim ekranlarına giremez, klinik kilitlenir.
      if (mevcut.kullaniciId && veri.rol !== "klinik_admin") {
        const mevcutKullanici = (await tx.select({ rol: sema.kullanici.rol }).from(sema.kullanici).where(eq(sema.kullanici.id, mevcut.kullaniciId)).limit(1))[0];
        if (mevcutKullanici?.rol === "klinik_admin") {
          const [{ n }] = await tx.select({ n: count() }).from(sema.kullanici).where(and(eq(sema.kullanici.klinikId, o.klinikId), eq(sema.kullanici.rol, "klinik_admin"), ne(sema.kullanici.id, mevcut.kullaniciId)));
          if (n === 0) return "Klinikte başka yönetici yok; son yöneticinin rolü değiştirilemez. Önce başka bir personeli yönetici yapın.";
        }
      }

      await tx
        .update(sema.personel)
        .set({
          adSoyad: veri.ad_soyad,
          gorev: poz.ad,
          pozisyonId: poz.id,
          dogumTarihi: veri.dogum_tarihi || null,
          dogumYeri: veri.dogum_yeri || null,
          cinsiyet: veri.cinsiyet || null,
          departman: veri.departman || null,
          calismaTipi: veri.calisma_tipi || null,
          sgkSicilNo: veri.sgk_sicil_no || null,
          iseGirisTarihi: veri.ise_giris_tarihi || null,
          istenCikisTarihi: veri.isten_cikis_tarihi || null,
          imzaYetkilisiMi: veri.imza_yetkilisi_mi === "on",
          il: veri.il || null,
          ilce: veri.ilce || null,
          mahalle: veri.mahalle || null,
          adres: veri.adres || null,
        })
        .where(eq(sema.personel.id, personelId));

      if (mevcut.kullaniciId) {
        await tx.update(sema.kullanici).set({ adSoyad: veri.ad_soyad, telefon: veri.gsm, rol: veri.rol }).where(eq(sema.kullanici.id, mevcut.kullaniciId));
      }

      uyariListesi = await yardimciKayitlariIsle(tx, o.klinikId, personelId, veri, kaseDosyasi instanceof File ? kaseDosyasi : null);

      // Çıkış tarihinden sonraki planlanmış randevular çizelgede sessizce kalmasın — yönetici uyarılır (otomatik iptal edilmez: hastaya haber verilmeli).
      if (veri.isten_cikis_tarihi && veri.isten_cikis_tarihi !== mevcut.istenCikis) {
        const terapist = (await tx.select({ id: sema.terapist.id }).from(sema.terapist).where(eq(sema.terapist.personelId, personelId)).limit(1))[0];
        if (terapist) {
          const ertesiGun = new Date(Date.parse(`${veri.isten_cikis_tarihi}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
          const [{ n }] = await tx
            .select({ n: count() })
            .from(sema.randevu)
            .where(and(eq(sema.randevu.terapistId, terapist.id), inArray(sema.randevu.durum, ["planlandi", "ertelendi"]), gte(sema.randevu.baslangic, toUTC(`${ertesiGun}T00:00:00`))));
          if (n > 0) randevuUyarisi = `Bu terapistin çıkış tarihinden sonra ${n} planlanmış randevusu var — Randevu Çizelgesi'nden başka terapiste aktarın ya da iptal edin.`;
        }
      }
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    console.error("personel güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  // Kimlik tarafı (ayrı havuz): çıkış tarihi değişimi → hesabı devre dışı bırak/aç (açık oturumlar iptal); telefon/rol → giriş kuralı eşitlemesi.
  let hesapMesaji: string | null = null;
  let hesapHata = false;
  const yeniCikisVarMi = Boolean(veri.isten_cikis_tarihi);
  if (kullaniciId) {
    try {
      await kimlikBilgisiGuncelle(kullaniciId, { telefon: veri.gsm, rol: veri.rol });
      if (eskiCikisVarMi !== yeniCikisVarMi) {
        if (yeniCikisVarMi) await hesabiDevreDisiBirak(kullaniciId);
        else await hesabiYenidenEtkinlestir(kullaniciId);
        hesapMesaji = yeniCikisVarMi ? "Giriş erişimi iptal edildi." : "Giriş erişimi geri açıldı.";
      }
    } catch (e) {
      console.error("personel kimlik hesabı güncellenemedi:", e instanceof Error ? e.message : e);
      hesapHata = true;
      hesapMesaji = yeniCikisVarMi
        ? "Personel pasife alındı ama giriş erişimi iptal edilemedi, lütfen tekrar deneyin."
        : "Personel aktif edildi ama giriş erişimi geri açılamadı, lütfen tekrar deneyin.";
    }
  }

  const ekMesaj = [uyariListesi, hesapMesaji, randevuUyarisi].filter(Boolean).join(" ");

  revalidatePath(`/panel/personel/${personelId}`);
  revalidatePath("/panel/personel");
  return {
    success: true,
    message: ekMesaj ? `Kaydedildi. ${ekMesaj}` : "Kaydedildi.",
    uyari: Boolean(uyariListesi) || hesapHata || Boolean(randevuUyarisi),
  };
}

/**
 * Personel Listesi kutucuklarındaki Giriş/Çıkış — kart üzerinde önce o anki
 * saat gösterilir (kullanıcı "Onayla" veya "Düzenle" ile değiştirebilir),
 * onaylanan saat bugünün personel_puantaj satırına yazılır. Çalışma
 * Çizelgesi'ndeki gunKaydet ile aynı RLS/yetki sınırı (klinik_admin). Var olan
 * bir saati asla sessizce ezmiyor (yanlışlıkla iki kez tıklanırsa mevcut kayıt
 * korunur, düzeltme Puantaj Cetveli'nden yapılır).
 */
export async function hizliPuantajKaydet(
  personelId: string,
  tur: "giris" | "cikis",
  saat: string
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(personelId).success) return { success: false, message: "Personel bulunamadı." };

  if (!/^\d{2}:\d{2}$/.test(saat)) {
    return { success: false, message: "Saat geçersiz." };
  }

  const tarih = bugunTarih();
  const zamanIso = toUTC(`${tarih}T${saat}:00`);

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      const P = sema.personelPuantaj;
      const personel = await tx.select({ id: sema.personel.id }).from(sema.personel).where(eq(sema.personel.id, personelId)).limit(1);
      if (personel.length === 0) return "Personel bulunamadı.";
      const mevcut = (await tx.select({ id: P.id, giris: P.girisSaat, cikis: P.cikisSaat }).from(P).where(and(eq(P.personelId, personelId), eq(P.tarih, tarih))).limit(1))[0];

      if (tur === "giris") {
        if (mevcut?.giris) return `Bugün için giriş zaten kaydedilmiş (${formatTime(mevcut.giris)}).`;
        if (mevcut) await tx.update(P).set({ girisSaat: zamanIso }).where(eq(P.id, mevcut.id));
        else await tx.insert(P).values({ klinikId: o.klinikId, personelId, tarih, girisSaat: zamanIso } as typeof P.$inferInsert); // durum: tetikleyici
      } else {
        if (!mevcut?.giris) return "Önce giriş kaydedilmeli.";
        if (mevcut.cikis) return `Bugün için çıkış zaten kaydedilmiş (${formatTime(mevcut.cikis)}).`;
        await tx.update(P).set({ cikisSaat: zamanIso }).where(eq(P.id, mevcut.id));
      }
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    const h = pgHata(e);
    console.error("Hızlı puantaj kaydedilemedi:", h.mesaj);
    if (h.kod === "23514") {
      return { success: false, message: "Çıkış saati giriş saatinden önce olamaz." };
    }
    if (h.kod === "42501" || h.mesaj.includes("row-level security")) {
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

const topluHareketKalemSemasi = z.object({
  personelId: z.string().uuid(),
  tutar: pozitifTutarKurus(),
});

const topluHareketSemasi = z.object({
  tur: z.enum(["prim", "yol", "yemek", "mesai", "avans", "kesinti", "odeme"]),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
  odeme_tipi: z.enum(["nakit", "havale"]).optional().or(z.literal("")),
  banka_hesap_id: z.string().trim().optional(),
  kalemler_json: z.string().min(1),
});

/** Bir toplu isteğin ANAHTARINDAN kalem başına kararlı bir uuid türetir (aynı istek tekrarlanırsa aynı kalem anahtarı → kalem tekrar yazılmaz). */
function kalemAnahtari(anahtar: string, personelId: string): string {
  const h = createHash("sha256").update(`${anahtar}:${personelId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Hesap sekmesindeki "Ödeme Ekle"nin ortak yazma yolu — Tekil modda tek
 * elemanlı, Toplu Ödeme modda çok elemanlı `kalemler_json` ile aynı action
 * çağrılır. Her kalem kendi transaction'ında personel_hesap_hareket_ekle
 * RPC'sine gider — biri başarısız olsa bile diğerleri kaydedilmeye devam eder
 * (satır bazlı hata toleransı); sonuçta kaç tanesinin başarılı olduğu bildirilir.
 * Çift gönderim: istek anahtarından türetilen kalem anahtarı ödemeyle AYNI transaction'da kaydedilir.
 */
export async function topluHesapHareketiEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = topluHareketSemasi.safeParse({
    tur: formData.get("tur"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
    odeme_tipi: formData.get("odeme_tipi") ?? "",
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
    kalemler_json: formData.get("kalemler_json"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { tur, tarih, aciklama, odeme_tipi, banka_hesap_id, kalemler_json } = ayristirma.data;
  if (havaleHesapEksikMi(odeme_tipi, banka_hesap_id) || (odeme_tipi === "havale" && !UUID.safeParse(banka_hesap_id).success)) {
    return { success: false, message: HAVALE_HESAP_GEREKLI_MESAJI };
  }

  let kalemlerHam: unknown;
  try {
    kalemlerHam = JSON.parse(kalemler_json);
  } catch {
    return { success: false, message: "Girdi hatalı." };
  }

  const kalemlerAyristirma = z.array(topluHareketKalemSemasi).min(1, "En az bir personel seçilmeli.").safeParse(kalemlerHam);
  if (!kalemlerAyristirma.success) {
    return { success: false, message: kalemlerAyristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const anahtar = islemAnahtariniOku(formData);
  let basarili = 0;
  let basarisiz = 0;
  for (const kalem of kalemlerAyristirma.data) {
    try {
      await withTenant(o.bag, async (tx) => {
        if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar ? kalemAnahtari(anahtar, kalem.personelId) : null, "personel_toplu_odeme", o.kullaniciId))) return;
        await rpc(tx, "personel_hesap_hareket_ekle", {
          p_personel_id: kalem.personelId,
          p_tur: tur,
          p_tutar: kurusMetni(kalem.tutar),
          p_tarih: tarih,
          p_aciklama: aciklama ? aciklama : null,
          p_odeme_tipi: odeme_tipi ? odeme_tipi : null,
          p_banka_hesap_id: odeme_tipi === "havale" && banka_hesap_id ? banka_hesap_id : null,
        });
      });
      basarili++;
    } catch (e) {
      console.error("Toplu hesap hareketi eklenemedi:", kalem.personelId, pgHata(e).mesaj);
      basarisiz++;
    }
  }

  revalidatePath("/panel/personel");

  if (basarili === 0) {
    return { success: false, message: "Hiçbir ödeme eklenemedi, lütfen tekrar deneyin." };
  }
  return {
    success: true,
    message:
      basarisiz > 0
        ? `${basarili} personele ödeme eklendi, ${basarisiz} tanesi başarısız oldu.`
        : `${basarili} personele ödeme eklendi.`,
  };
}

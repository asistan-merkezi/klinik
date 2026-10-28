"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant, type Tx } from "@/lib/db";
import { finansOturumu } from "@/lib/finans/eylem";
import { negatifOlmayanTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

const adminOturumu = () => finansOturumu(["klinik_admin"]);
const UUID = z.string().uuid();

// Boş bırakılan kademe fiyatı (plus/elit/prime) null'a düşer — o kademe için
// override yok demektir, islem_tanimi_etkin_fiyat() vita_fiyat + iskonto
// oranından hesaplar (bkz. 20260805110000_hasta_kategori_iskonto_oranlari.sql). Fiyatlar KURUŞ olarak ayrıştırılır.
const kademeFiyatiSemasi = z
  .union([negatifOlmayanTutarKurus("Fiyat 0'dan küçük olamaz."), z.literal("")])
  .optional()
  .transform((deger) => (deger === "" || deger === undefined ? null : (deger as number)));

const adimSemasi = z.object({
  id: z.union([z.string().uuid(), z.null()]).optional(),
  ad: z.string().trim().min(2, "İşlem adı en az 2 karakter olmalı."),
  uygulayici_pozisyon_id: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  gerekli_cihaz_id: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  sure_dakika: z
    .union([z.coerce.number().int().min(1, "Süre 1 dakikadan az olamaz."), z.literal(""), z.null()])
    .optional()
    .transform((deger) => (deger === "" || deger === null || deger === undefined ? null : deger)),
});

const islemSemasi = z.object({
  ad: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  vita_fiyat: negatifOlmayanTutarKurus("Fiyat 0'dan küçük olamaz."),
  plus_fiyat: kademeFiyatiSemasi,
  elit_fiyat: kademeFiyatiSemasi,
  prime_fiyat: kademeFiyatiSemasi,
  kdv_orani: z.coerce.number().min(0, "KDV 0-100 arasında olmalı.").max(100, "KDV 0-100 arasında olmalı."),
  muhasebe_hizmet_ismi: z.string().trim().optional(),
  adimlar: z.array(adimSemasi).min(1, "En az bir işlem eklenmeli."),
});

function ayristir(formData: FormData) {
  let adimlarHam: unknown = [];
  try {
    adimlarHam = JSON.parse(String(formData.get("adimlar") ?? "[]"));
  } catch {
    adimlarHam = [];
  }

  return islemSemasi.safeParse({
    ad: formData.get("ad"),
    vita_fiyat: formData.get("vita_fiyat"),
    plus_fiyat: formData.get("plus_fiyat") ?? "",
    elit_fiyat: formData.get("elit_fiyat") ?? "",
    prime_fiyat: formData.get("prime_fiyat") ?? "",
    kdv_orani: formData.get("kdv_orani"),
    muhasebe_hizmet_ismi: formData.get("muhasebe_hizmet_ismi") ?? "",
    adimlar: adimlarHam,
  });
}

/** İstemciden gelen pozisyon/cihaz kimlikleri bu kliniğe ait mi (FK tenant'ı doğrulamaz). Dönüş: hata mesajı veya null. */
async function pozisyonCihazDogrula(tx: Tx, pozisyonId: string | null | undefined, cihazId: string | null | undefined): Promise<string | null> {
  if (pozisyonId) {
    const p = await tx.select({ id: sema.pozisyonlar.id }).from(sema.pozisyonlar).where(eq(sema.pozisyonlar.id, pozisyonId)).limit(1);
    if (p.length === 0) return "Seçilen pozisyon bulunamadı.";
  }
  if (cihazId) {
    const c = await tx.select({ id: sema.cihaz.id }).from(sema.cihaz).where(eq(sema.cihaz.id, cihazId)).limit(1);
    if (c.length === 0) return "Seçilen cihaz bulunamadı.";
  }
  return null;
}

const kurusOpsiyonel = (k: number | null) => (k === null ? null : kurusMetni(k));

async function islemTanimiKaydet(islemId: string | null, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (islemId !== null && !UUID.safeParse(islemId).success) return { success: false, message: "Tedavi tanımı bulunamadı." };

  const ayristirma = ayristir(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad, vita_fiyat, plus_fiyat, elit_fiyat, prime_fiyat, kdv_orani, muhasebe_hizmet_ismi, adimlar } = ayristirma.data;

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      for (const a of adimlar) {
        const h = await pozisyonCihazDogrula(tx, a.uygulayici_pozisyon_id || null, a.gerekli_cihaz_id || null);
        if (h) return h;
      }
      // RPC rol + tenant + tedavi sahipliğini kendisi doğrular; tedavi + adımlar atomik diff.
      await rpc(tx, "islem_tanimi_kaydet", {
        p_id: islemId,
        p_ad: ad,
        p_vita_fiyat: kurusMetni(vita_fiyat),
        p_plus_fiyat: kurusOpsiyonel(plus_fiyat),
        p_elit_fiyat: kurusOpsiyonel(elit_fiyat),
        p_prime_fiyat: kurusOpsiyonel(prime_fiyat),
        p_kdv_orani: kdv_orani.toFixed(2),
        p_muhasebe_hizmet_ismi: muhasebe_hizmet_ismi ? muhasebe_hizmet_ismi : null,
        p_adimlar: adimlar.map((a) => ({
          id: a.id ?? null,
          ad: a.ad,
          uygulayici_pozisyon_id: a.uygulayici_pozisyon_id ? a.uygulayici_pozisyon_id : null,
          gerekli_cihaz_id: a.gerekli_cihaz_id ? a.gerekli_cihaz_id : null,
          sure_dakika: a.sure_dakika,
        })),
      });
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    const h = pgHata(e);
    console.error(`Tedavi tanımı ${islemId ? "güncellenemedi" : "oluşturulamadı"}:`, h.mesaj);
    if (h.kod === "42501" || h.mesaj?.includes("yetkisiz")) {
      return { success: false, message: YETKISIZ_MESAJI };
    }
    return {
      success: false,
      message: islemId
        ? "Tedavi tanımı güncellenemedi, lütfen tekrar deneyin."
        : "Tedavi tanımı eklenemedi, lütfen tekrar deneyin.",
    };
  }

  revalidatePath("/panel/islemler");
  return { success: true, message: islemId ? "Tedavi tanımı güncellendi." : "Tedavi tanımı eklendi." };
}

export async function islemTanimiOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  return islemTanimiKaydet(null, formData);
}

export async function islemTanimiGuncelle(
  islemId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  return islemTanimiKaydet(islemId, formData);
}

// yeni-islem-sablonu-dialog.tsx'teki Select'in "Yok" seçeneği için sentinel —
// Base UI Select boş string'i gerçek bir öğe olarak seçtiremediğinden.
const CIHAZ_YOK_DEGERI = "__yok__";

const sablonSemasi = z.object({
  ad: z.string().trim().min(2, "İşlem adı en az 2 karakter olmalı."),
  uygulayici_pozisyon_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  gerekli_cihaz_id: z
    .union([z.string().uuid(), z.literal(""), z.literal(CIHAZ_YOK_DEGERI)])
    .optional()
    .transform((deger) => (deger === CIHAZ_YOK_DEGERI ? "" : deger)),
  sure_dakika: z
    .union([z.coerce.number().int().min(1, "Süre 1 dakikadan az olamaz."), z.literal("")])
    .optional()
    .transform((deger) => (deger === "" || deger === undefined ? null : deger)),
});

export async function islemAdimiSablonuOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = sablonSemasi.safeParse({
    ad: formData.get("ad"),
    uygulayici_pozisyon_id: formData.get("uygulayici_pozisyon_id") ?? "",
    gerekli_cihaz_id: formData.get("gerekli_cihaz_id") ?? "",
    sure_dakika: formData.get("sure_dakika") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad, uygulayici_pozisyon_id, gerekli_cihaz_id, sure_dakika } = ayristirma.data;

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      const h = await pozisyonCihazDogrula(tx, uygulayici_pozisyon_id || null, gerekli_cihaz_id || null);
      if (h) return h;
      await tx.insert(sema.islemAdimiSablonu).values({
        klinikId: o.klinikId,
        ad,
        uygulayiciPozisyonId: uygulayici_pozisyon_id ? uygulayici_pozisyon_id : null,
        gerekliCihazId: gerekli_cihaz_id ? gerekli_cihaz_id : null,
        sureDakika: sure_dakika,
      });
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    const h = pgHata(e);
    console.error("İşlem tanımlama eklenemedi:", h.mesaj);
    if (h.kod === "23505") {
      return { success: false, message: "Bu isimde bir işlem tanımı zaten var." };
    }
    return { success: false, message: "İşlem tanımı eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/islemler");
  revalidatePath("/panel/islemler/tanimlamalar");
  return { success: true, message: "İşlem tanımı eklendi." };
}

const sablonGuncelleSemasi = z.object({
  ad: z.string().trim().min(2, "İşlem adı en az 2 karakter olmalı."),
  uygulayici_pozisyon_id: z.string().uuid().nullable(),
  gerekli_cihaz_id: z.string().uuid().nullable(),
  sure_dakika: z.number().int().min(1, "Süre 1 dakikadan az olamaz.").nullable(),
});

export async function islemAdimiSablonuGuncelle(
  sablonId: string,
  veri: {
    ad: string;
    uygulayici_pozisyon_id: string | null;
    gerekli_cihaz_id: string | null;
    sure_dakika: number | null;
  }
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(sablonId).success) return { success: false, message: "İşlem tanımı bulunamadı." };

  const ayristirma = sablonGuncelleSemasi.safeParse(veri);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad, uygulayici_pozisyon_id, gerekli_cihaz_id, sure_dakika } = ayristirma.data;

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      const h = await pozisyonCihazDogrula(tx, uygulayici_pozisyon_id, gerekli_cihaz_id);
      if (h) return h;
      const g = await tx
        .update(sema.islemAdimiSablonu)
        .set({ ad, uygulayiciPozisyonId: uygulayici_pozisyon_id, gerekliCihazId: gerekli_cihaz_id, sureDakika: sure_dakika })
        .where(and(eq(sema.islemAdimiSablonu.id, sablonId)))
        .returning({ id: sema.islemAdimiSablonu.id });
      return g.length === 0 ? "İşlem tanımı bulunamadı." : null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    const h = pgHata(e);
    console.error("İşlem tanımlama güncellenemedi:", h.mesaj);
    if (h.kod === "23505") {
      return { success: false, message: "Bu isimde bir işlem tanımı zaten var." };
    }
    return { success: false, message: "İşlem tanımı güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/islemler");
  revalidatePath("/panel/islemler/tanimlamalar");
  return { success: true, message: "İşlem tanımı güncellendi." };
}

export async function islemAdimiSablonuAktifDurumDegistir(sablonId: string, yeniDurum: boolean) {
  const o = await adminOturumu();
  if (!o || !UUID.safeParse(sablonId).success) return;

  try {
    await withTenant(o.bag, (tx) => tx.update(sema.islemAdimiSablonu).set({ aktif: yeniDurum }).where(eq(sema.islemAdimiSablonu.id, sablonId)));
  } catch (e) {
    console.error("İşlem tanımlama durumu güncellenemedi:", pgHata(e).mesaj);
    return;
  }

  revalidatePath("/panel/islemler");
  revalidatePath("/panel/islemler/tanimlamalar");
}

export async function islemTanimiAktifDurumDegistir(islemId: string, yeniDurum: boolean) {
  const o = await adminOturumu();
  if (!o || !UUID.safeParse(islemId).success) return;

  try {
    await withTenant(o.bag, (tx) => tx.update(sema.islemTanimi).set({ aktif: yeniDurum }).where(eq(sema.islemTanimi.id, islemId)));
  } catch (e) {
    console.error("Tedavi tanımı durumu güncellenemedi:", pgHata(e).mesaj);
    return;
  }

  revalidatePath("/panel/islemler");
}

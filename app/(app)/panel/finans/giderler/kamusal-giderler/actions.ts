"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { ARAC_GEREKTIREN_TIPLER } from "@/types/kamusal-odeme";
import { bankaHesabiHatasiniCevir } from "@/lib/finans/banka-hesabi-kurali";
import { finansOturumu } from "@/lib/finans/eylem";
import { islemAnahtariniKaydet, islemAnahtariniOku } from "@/lib/finans/idempotans";
import { pozitifTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

// Migration 20260809120000'daki kamusal_odeme.odeme_tipi CHECK'iyle birebir aynı liste.
const odemeSemasi = z.object({
  odeme_tipi: z.enum([
    "kdv",
    "stopaj_muhtasar",
    "sgk_primleri",
    "damga_vergisi",
    "emlak_vergisi",
    "motorlu_tasitlar_vergisi",
    "bagkur_primleri",
    "muhasebe_ucreti",
    "trafik_cezasi",
    "gec_odeme_faizi",
    "gecici_vergi",
    "kurumlar_vergisi",
  ]),
  tutar: pozitifTutarKurus(),
  donem_ay: z.coerce.number().int().min(1, "Dönem ayı seçilmeli.").max(12, "Dönem ayı seçilmeli."),
  donem_yil: z.coerce.number().int().min(2000, "Dönem yılı geçersiz.").max(2100, "Dönem yılı geçersiz."),
  vade_tarihi: z.string().min(1, "Vade tarihi seçilmeli."),
  odeme_tarihi: z.string().trim().optional(),
  notlar: z.string().trim().optional(),
  arac_id: z.string().trim().optional(),
  odeme_yontemi: z.enum(["nakit", "havale"]).optional().or(z.literal("")),
  banka_hesap_id: z.string().trim().optional(),
});

function formVerisiOku(formData: FormData) {
  return odemeSemasi.safeParse({
    odeme_tipi: formData.get("odeme_tipi"),
    tutar: formData.get("tutar"),
    donem_ay: formData.get("donem_ay"),
    donem_yil: formData.get("donem_yil"),
    vade_tarihi: formData.get("vade_tarihi"),
    odeme_tarihi: formData.get("odeme_tarihi") ?? "",
    notlar: formData.get("notlar") ?? "",
    arac_id: formData.get("arac_id") ?? "",
    odeme_yontemi: formData.get("odeme_yontemi") ?? "",
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
  });
}

/**
 * Ödenen (ödeme tarihi girilmiş) kamusal ödeme Kasa/Banka defterine çıkış olarak düşer — bunun için
 * ödeme yöntemi (havale ise banka hesabı) zorunlu. Ödenmemişse yöntem/hesap boş tutulur.
 */
function odemeBilgisiCoz(veri: z.infer<typeof odemeSemasi>):
  | { hata: string }
  | { odeme_yontemi: "nakit" | "havale" | null; banka_hesap_id: string | null } {
  if (!veri.odeme_tarihi) return { odeme_yontemi: null, banka_hesap_id: null };
  if (!veri.odeme_yontemi) return { hata: "Ödeme tarihi girildiyse ödeme yöntemi (Nakit/Havale) seçilmeli." };
  if (veri.odeme_yontemi === "havale" && !z.string().uuid().safeParse(veri.banka_hesap_id).success) return { hata: "Havale için banka hesabı seçilmeli." };
  return {
    odeme_yontemi: veri.odeme_yontemi,
    banka_hesap_id: veri.odeme_yontemi === "havale" ? veri.banka_hesap_id ?? null : null,
  };
}

function finansSayfalariniYenile() {
  revalidatePath("/panel/finans/giderler/kamusal-giderler");
  revalidatePath("/panel/finans/raporlar");
  revalidatePath("/panel/finans/kasa");
  revalidatePath("/panel/finans/banka");
}

export async function kamusalOdemeEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { odeme_tipi, tutar, donem_ay, donem_yil, vade_tarihi, odeme_tarihi, notlar, arac_id } = ayristirma.data;

  if (ARAC_GEREKTIREN_TIPLER.includes(odeme_tipi) && !arac_id) {
    return { success: false, message: "Bu ödeme tipi için araç seçilmeli." };
  }
  const aracId = ARAC_GEREKTIREN_TIPLER.includes(odeme_tipi) && arac_id ? arac_id : null;
  if (aracId && !z.string().uuid().safeParse(aracId).success) return { success: false, message: "Seçilen araç bulunamadı." };

  const odemeBilgisi = odemeBilgisiCoz(ayristirma.data);
  if ("hata" in odemeBilgisi) {
    return { success: false, message: odemeBilgisi.hata };
  }

  const anahtar = islemAnahtariniOku(formData);
  try {
    const hata = await withTenant(o.bag, async (tx) => {
      if (aracId) {
        const arac = await tx.select({ id: sema.klinikArac.id }).from(sema.klinikArac).where(and(eq(sema.klinikArac.id, aracId), eq(sema.klinikArac.klinikId, o.klinikId))).limit(1);
        if (arac.length === 0) return "Seçilen araç bulunamadı.";
      }
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, "kamusal_odeme_ekle", o.kullaniciId))) return null;
      await tx.insert(sema.kamusalOdeme).values({
        klinikId: o.klinikId,
        odemeTipi: odeme_tipi,
        tutar: kurusMetni(tutar),
        donemAy: donem_ay,
        donemYil: donem_yil,
        vadeTarihi: vade_tarihi,
        odemeTarihi: odeme_tarihi ? odeme_tarihi : null,
        notlar: notlar ? notlar : null,
        aracId,
        odemeYontemi: odemeBilgisi.odeme_yontemi,
        bankaHesapId: odemeBilgisi.banka_hesap_id,
        olusturanKullaniciId: o.kullaniciId,
      });
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    const h = pgHata(e);
    console.error("Kamusal ödeme kaydedilemedi:", h.mesaj);
    return { success: false, message: bankaHesabiHatasiniCevir(h.mesaj) ?? "Ödeme kaydedilemedi, lütfen tekrar deneyin." };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Ödeme kaydedildi." };
}

export async function kamusalOdemeGuncelle(
  id: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Ödeme bulunamadı." };

  const ayristirma = formVerisiOku(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { odeme_tipi, tutar, donem_ay, donem_yil, vade_tarihi, odeme_tarihi, notlar, arac_id } = ayristirma.data;

  if (ARAC_GEREKTIREN_TIPLER.includes(odeme_tipi) && !arac_id) {
    return { success: false, message: "Bu ödeme tipi için araç seçilmeli." };
  }
  const aracId = ARAC_GEREKTIREN_TIPLER.includes(odeme_tipi) && arac_id ? arac_id : null;
  if (aracId && !z.string().uuid().safeParse(aracId).success) return { success: false, message: "Seçilen araç bulunamadı." };

  const odemeBilgisi = odemeBilgisiCoz(ayristirma.data);
  if ("hata" in odemeBilgisi) {
    return { success: false, message: odemeBilgisi.hata };
  }

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      if (aracId) {
        const arac = await tx.select({ id: sema.klinikArac.id }).from(sema.klinikArac).where(and(eq(sema.klinikArac.id, aracId), eq(sema.klinikArac.klinikId, o.klinikId))).limit(1);
        if (arac.length === 0) return "Seçilen araç bulunamadı.";
      }
      const g = await tx
        .update(sema.kamusalOdeme)
        .set({
          odemeTipi: odeme_tipi,
          tutar: kurusMetni(tutar),
          donemAy: donem_ay,
          donemYil: donem_yil,
          vadeTarihi: vade_tarihi,
          odemeTarihi: odeme_tarihi ? odeme_tarihi : null,
          notlar: notlar ? notlar : null,
          aracId,
          odemeYontemi: odemeBilgisi.odeme_yontemi,
          bankaHesapId: odemeBilgisi.banka_hesap_id,
        })
        .where(eq(sema.kamusalOdeme.id, id))
        .returning({ id: sema.kamusalOdeme.id });
      return g.length === 0 ? "Ödeme bulunamadı." : null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    const h = pgHata(e);
    console.error("Kamusal ödeme güncellenemedi:", h.mesaj);
    return { success: false, message: bankaHesabiHatasiniCevir(h.mesaj) ?? "Ödeme güncellenemedi, lütfen tekrar deneyin." };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Ödeme güncellendi." };
}

export async function kamusalOdemeSil(id: string): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Ödeme bulunamadı." };

  try {
    const silinen = await withTenant(o.bag, (tx) => tx.delete(sema.kamusalOdeme).where(eq(sema.kamusalOdeme.id, id)).returning({ id: sema.kamusalOdeme.id }));
    if (silinen.length === 0) return { success: false, message: "Ödeme bulunamadı." };
  } catch (e) {
    console.error("Kamusal ödeme silinemedi:", pgHata(e).mesaj);
    return { success: false, message: "Ödeme silinemedi, lütfen tekrar deneyin." };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Ödeme silindi." };
}

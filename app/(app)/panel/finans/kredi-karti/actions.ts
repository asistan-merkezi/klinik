"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { finansOturumu } from "@/lib/finans/eylem";
import { finansSayfalariniYenile } from "@/lib/finans/sayfa-yenile";
import { islemAnahtariniKaydet, islemAnahtariniOku } from "@/lib/finans/idempotans";
import { pozitifTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import { YETKISIZ_MESAJI } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

const kartOdemeSemasi = z.strictObject({
  kredi_karti_id: z.string().uuid("Kredi kartı seçilmeli."),
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  odeme_tipi: z.enum(["nakit", "havale"], { message: "Ödeme yeri (Kasa/Banka) seçilmeli." }),
  banka_hesap_id: z.string().trim().optional(),
  aciklama: z.string().trim().optional(),
});

/**
 * Şirket kredi kartına ödeme: Kasa'dan (nakit) ya da Banka'dan (havale) ÇIKIŞ olur ve kart borcunu düşürür.
 * Raporlar'da gider SAYILMAZ (harcama kartla yapıldığı anda gider sayılmıştı, çift sayım olmasın).
 */
export async function krediKartiOdemeEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) {
    return { success: false, message: YETKISIZ_MESAJI };
  }
  const ayristirma = kartOdemeSemasi.safeParse({
    kredi_karti_id: formData.get("kredi_karti_id") ?? "",
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    odeme_tipi: formData.get("odeme_tipi"),
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
    aciklama: formData.get("aciklama") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const veri = ayristirma.data;
  if (veri.odeme_tipi === "havale" && (!veri.banka_hesap_id || !z.string().uuid().safeParse(veri.banka_hesap_id).success)) {
    return { success: false, message: "Havale için banka hesabı seçilmeli." };
  }

  const anahtar = islemAnahtariniOku(formData);
  try {
    const sonuc = await withTenant(o.bag, async (tx) => {
      // FK tenant'ı doğrulamaz — RLS'e tabi bu sorgular başka kliniğin kart/hesap kimliğiyle yazımı engeller.
      const kart = await tx.select({ id: sema.klinikKrediKartlari.id }).from(sema.klinikKrediKartlari).where(and(eq(sema.klinikKrediKartlari.id, veri.kredi_karti_id), eq(sema.klinikKrediKartlari.klinikId, o.klinikId))).limit(1);
      if (kart.length === 0) return "Seçilen kredi kartı bulunamadı.";
      if (veri.odeme_tipi === "havale") {
        const hesap = await tx.select({ id: sema.klinikBankaHesaplari.id }).from(sema.klinikBankaHesaplari).where(and(eq(sema.klinikBankaHesaplari.id, veri.banka_hesap_id ?? ""), eq(sema.klinikBankaHesaplari.klinikId, o.klinikId))).limit(1);
        if (hesap.length === 0) return "Seçilen banka hesabı bulunamadı.";
      }
      if (!(await islemAnahtariniKaydet(tx, o.klinikId, anahtar, "kredi_karti_odeme", o.kullaniciId))) return null;
      await tx.insert(sema.klinikKrediKartiOdeme).values({
        klinikId: o.klinikId,
        krediKartiId: veri.kredi_karti_id,
        tutar: kurusMetni(veri.tutar),
        tarih: veri.tarih,
        odemeTipi: veri.odeme_tipi,
        bankaHesapId: veri.odeme_tipi === "havale" ? veri.banka_hesap_id : null,
        aciklama: veri.aciklama ? veri.aciklama : null,
        olusturanKullaniciId: o.kullaniciId,
      });
      return null;
    });
    if (sonuc) return { success: false, message: sonuc };
  } catch (e) {
    console.error("Kart ödemesi kaydedilemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kart ödemesi kaydedilemedi, lütfen tekrar deneyin." };
  }

  finansSayfalariniYenile();
  return { success: true, message: "Kart ödemesi kaydedildi." };
}

export async function krediKartiOdemeSil(id: string): Promise<SonucDurumu> {
  const o = await finansOturumu(["klinik_admin"]);
  if (!o) {
    return { success: false, message: YETKISIZ_MESAJI };
  }
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Kart ödemesi bulunamadı." };
  try {
    const silinen = await withTenant(o.bag, (tx) =>
      tx.delete(sema.klinikKrediKartiOdeme).where(and(eq(sema.klinikKrediKartiOdeme.id, id), eq(sema.klinikKrediKartiOdeme.klinikId, o.klinikId))).returning({ id: sema.klinikKrediKartiOdeme.id })
    );
    if (silinen.length === 0) return { success: false, message: "Kart ödemesi bulunamadı." };
  } catch (e) {
    console.error("Kart ödemesi silinemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kart ödemesi silinemedi, lütfen tekrar deneyin." };
  }
  finansSayfalariniYenile();
  return { success: true, message: "Kart ödemesi silindi." };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { count, desc, eq } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { finansOturumu } from "@/lib/finans/eylem";
import { negatifOlmayanTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import type { PaketKatilimciSatir } from "@/types/paket";

type SonucDurumu = { success: boolean; message: string } | null;

const adminOturumu = () => finansOturumu(["klinik_admin"]);
const UUID = z.string().uuid();

const paketSemasi = z.object({
  ad: z.string().trim().min(2, "Ad en az 2 karakter olmalı."),
  islem_tanimi_id: z.string().uuid("İşlem tanımı seçilmeli."),
  seans_sayisi: z.coerce.number().int("Seans sayısı tam sayı olmalı.").min(1, "Seans sayısı en az 1 olmalı."),
  satis_bitis_tarihi: z.string().trim().optional().or(z.literal("")),
  fiyat: negatifOlmayanTutarKurus("Fiyat 0'dan küçük olamaz."),
  kdv_orani: z.coerce.number().min(0, "KDV 0-100 arasında olmalı.").max(100, "KDV 0-100 arasında olmalı."),
  kisi_kotasi: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int("Kişi kotası tam sayı olmalı.").min(1, "Kişi kotası en az 1 olmalı.").optional()
  ),
});

function ayristir(formData: FormData) {
  return paketSemasi.safeParse({
    ad: formData.get("ad"),
    islem_tanimi_id: formData.get("islem_tanimi_id"),
    seans_sayisi: formData.get("seans_sayisi"),
    satis_bitis_tarihi: formData.get("satis_bitis_tarihi") ?? "",
    fiyat: formData.get("fiyat"),
    kdv_orani: formData.get("kdv_orani"),
    kisi_kotasi: formData.get("kisi_kotasi") ?? "",
  });
}

export async function paketOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = ayristir(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad, islem_tanimi_id, seans_sayisi, satis_bitis_tarihi, fiyat, kdv_orani, kisi_kotasi } = ayristirma.data;

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      // FK tenant'ı doğrulamaz — RLS'li sorgu başka kliniğin tedavi kimliğini göstermez.
      const islem = await tx.select({ id: sema.islemTanimi.id }).from(sema.islemTanimi).where(eq(sema.islemTanimi.id, islem_tanimi_id)).limit(1);
      if (islem.length === 0) return "Seçilen tedavi bulunamadı.";
      await tx.insert(sema.paket).values({
        klinikId: o.klinikId,
        ad,
        islemTanimiId: islem_tanimi_id,
        seansSayisi: seans_sayisi,
        satisBitisTarihi: satis_bitis_tarihi || null,
        fiyat: kurusMetni(fiyat),
        kdvOrani: kdv_orani.toFixed(2),
        kisiKotasi: kisi_kotasi ?? null,
      });
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    console.error("Paket oluşturulamadı:", pgHata(e).mesaj);
    return { success: false, message: "Paket eklenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/paketler");
  return { success: true, message: "Paket eklendi." };
}

export async function paketGuncelle(
  paketId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const o = await adminOturumu();
  if (!o) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(paketId).success) return { success: false, message: "Paket bulunamadı." };

  const ayristirma = ayristir(formData);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad, islem_tanimi_id, seans_sayisi, satis_bitis_tarihi, fiyat, kdv_orani, kisi_kotasi } = ayristirma.data;

  try {
    const hata = await withTenant(o.bag, async (tx) => {
      const islem = await tx.select({ id: sema.islemTanimi.id }).from(sema.islemTanimi).where(eq(sema.islemTanimi.id, islem_tanimi_id)).limit(1);
      if (islem.length === 0) return "Seçilen tedavi bulunamadı.";

      // Kontrol + güncelleme aynı transaction'da, paket satırı kilitli: aynı anda satış yapılırsa yarış olmaz.
      const mevcut = (await tx.select({ islemTanimiId: sema.paket.islemTanimiId, seansSayisi: sema.paket.seansSayisi }).from(sema.paket).where(eq(sema.paket.id, paketId)).for("update").limit(1))[0];
      if (!mevcut) return "Paket bulunamadı.";

      // Satılmış pakette tedavi ve seans sayısı değiştirilemez: check-in'de paketten düşüm
      // paket.islem_tanimi_id ile eşleşir (mevcut alıcıların kalan hakları başka tedaviye kayardı) ve
      // satış kaydı toplam seans sayısını ayrıca tutmaz (kullanılan/toplam göstergesi bozulurdu).
      // Fiyat/KDV yalnız yeni satışları etkiler, serbest.
      if (mevcut.islemTanimiId !== islem_tanimi_id || mevcut.seansSayisi !== seans_sayisi) {
        const [{ n }] = await tx.select({ n: count() }).from(sema.paketSatis).where(eq(sema.paketSatis.paketId, paketId));
        if (n > 0) {
          return "Bu paket satılmış; tedavisi ve seans sayısı değiştirilemez. Farklı bir sürüm için paketi \"Tekrarla\" ile kopyalayıp yeni paket oluşturun.";
        }
      }

      await tx
        .update(sema.paket)
        .set({
          ad,
          islemTanimiId: islem_tanimi_id,
          seansSayisi: seans_sayisi,
          satisBitisTarihi: satis_bitis_tarihi || null,
          fiyat: kurusMetni(fiyat),
          kdvOrani: kdv_orani.toFixed(2),
          kisiKotasi: kisi_kotasi ?? null,
        })
        .where(eq(sema.paket.id, paketId));
      return null;
    });
    if (hata) return { success: false, message: hata };
  } catch (e) {
    console.error("Paket güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Paket güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/paketler");
  return { success: true, message: "Paket güncellendi." };
}

export async function paketAktifDurumDegistir(paketId: string, yeniDurum: boolean) {
  const o = await adminOturumu();
  if (!o || !UUID.safeParse(paketId).success) {
    return;
  }

  try {
    await withTenant(o.bag, (tx) => tx.update(sema.paket).set({ aktif: yeniDurum }).where(eq(sema.paket.id, paketId)));
  } catch (e) {
    console.error("Paket durumu güncellenemedi:", pgHata(e).mesaj);
    return;
  }

  revalidatePath("/panel/paketler");
}

export async function paketTekrarla(paketId: string) {
  const o = await adminOturumu();
  if (!o || !UUID.safeParse(paketId).success) {
    return;
  }

  try {
    await withTenant(o.bag, async (tx) => {
      const kaynak = (await tx.select().from(sema.paket).where(eq(sema.paket.id, paketId)).limit(1))[0];
      if (!kaynak) return;
      await tx.insert(sema.paket).values({
        klinikId: o.klinikId,
        ad: kaynak.ad,
        islemTanimiId: kaynak.islemTanimiId,
        seansSayisi: kaynak.seansSayisi,
        fiyat: kaynak.fiyat,
        kdvOrani: kaynak.kdvOrani,
        aktif: true,
        satisBitisTarihi: null,
        tekrarSayisi: 2,
      });
    });
  } catch (e) {
    console.error("Paket tekrarlanamadı:", pgHata(e).mesaj);
    return;
  }

  revalidatePath("/panel/paketler");
}

export async function paketKatilimcilariGetir(paketId: string): Promise<PaketKatilimciSatir[]> {
  const y = await eylemYetkisi(["klinik_admin", "resepsiyon", "muhasebe", "terapist"]);
  if (!y.yetkili || !y.bag || !UUID.safeParse(paketId).success) {
    return [];
  }

  try {
    const satirlar = await withTenant(y.bag, (tx) =>
      tx
        .select({ id: sema.paketSatis.id, hasta_id: sema.paketSatis.hastaId, kalan_adet: sema.paketSatis.kalanAdet, durum: sema.paketSatis.durum, ad_soyad: sema.hasta.adSoyad, kategori: sema.hasta.kategori })
        .from(sema.paketSatis)
        .leftJoin(sema.hasta, eq(sema.hasta.id, sema.paketSatis.hastaId))
        .where(eq(sema.paketSatis.paketId, paketId))
        .orderBy(desc(sema.paketSatis.satisTarihi))
    );
    return satirlar.map((satir) => ({
      paket_satis_id: satir.id,
      hasta_id: satir.hasta_id,
      ad_soyad: satir.ad_soyad ?? "—",
      kategori: (satir.kategori ?? "vita") as PaketKatilimciSatir["kategori"],
      kalan_adet: satir.kalan_adet,
      durum: satir.durum,
    }));
  } catch (e) {
    console.error("Katılımcılar getirilemedi:", pgHata(e).mesaj);
    return [];
  }
}

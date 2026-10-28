"use server";

import { negatifOlmayanTutarKurus, pozitifTutarKurus } from "@/lib/finans/tutar";
import { kurusMetni } from "@/lib/para";
import { after } from "next/server";
import { randevuOlayMesajiTetikle } from "@/lib/mesaj/randevu-mesaji";
import { odemeAlindiMesajiTetikle } from "@/lib/mesaj/hasta-mesaji";
import { bankaHesabiHatasiniCevir, havaleHesapEksikMi, HAVALE_HESAP_GEREKLI_MESAJI } from "@/lib/finans/banka-hesabi-kurali";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte, inArray } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant, type TenantBaglami, type Tx } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI, type PersonelRolu } from "@/lib/auth/yetki";
import { randevuKimlikleriniDogrula } from "@/lib/randevu/dogrulama";
import { anlikMesajTetikle } from "@/lib/mesaj/anlik-tetikle";
import { paketYenilemeGerekliMi } from "@/lib/paket/yenileme-esigi";
import { formatDateForInput, tarihiSimdikiSaatleUTC, toUTC } from "@/lib/datetime";
import { whatsappLinkOlustur } from "@/lib/utils";
import type { RandevuDurum } from "@/types/randevu";
import { GUN_ETIKETI, type HaftaninGunu } from "@/types/periyodik-randevu";
import { revalidateHastaDetay } from "../hastalar/[id]/revalidate";
import { terapistAtanabilirMi } from "@/lib/personel/atanabilir-terapistler";
import { terapistGunEngeli, terapistTarihteAtanabilirMi, terapistUygunlukGetir, type TerapistUygunluk } from "@/lib/randevu/terapist-uygunluk";

/** Rol kümeleri RLS ile birebir (randevu_insert_yetkili / randevu_update_*): randevu yazan roller ve yönetim (admin+resepsiyon). Muhasebe bilinçli dışarıda. */
const RANDEVU_ROLLERI: readonly PersonelRolu[] = ["klinik_admin", "resepsiyon", "terapist"];
const YONETIM_ROLLERI: readonly PersonelRolu[] = ["klinik_admin", "resepsiyon"];

/** Oturum + rol kapısı; yetkisizse null (çağıran YAZMADAN döner). Tenant ve kullanıcı oturumdan gelir, istemciden asla. */
async function yetkiAl(roller: readonly PersonelRolu[]) {
  const y = await eylemYetkisi(roller);
  if (!y.yetkili || !y.bag || !y.klinikId) return null;
  return { bag: y.bag, klinikId: y.klinikId, userId: y.ctx.userId, rol: y.ctx.rol };
}


type SonucDurumu = { success: boolean; message: string } | null;

/** İptal edilmiş ya da tamamlanmış randevu kapanmıştır; iptalden çıkış yalnız "İptali Geri Al" (yönetici). */
const KAPALI_RANDEVU_MESAJI =
  "Bu randevu iptal edilmiş ya da tamamlanmış, değiştirilemez. İptal edilen randevuyu yönetici \"İptali Geri Al\" ile açabilir.";

function randevuKapaliMi(durum: string | null | undefined) {
  return durum === "iptal" || durum === "tamamlandi";
}

const randevuSemasi = z.object({
  hasta_id: z.string().uuid("Hasta seçilmeli."),
  terapist_id: z.string().uuid("Terapist seçilmeli."),
  oda_id: z.string().uuid("Oda seçilmeli."),
  islem_tanimi_id: z.string().uuid("Tedavi seçilmeli."),
  cihaz_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih gerekli."),
  saat: z.string().regex(/^\d{2}:\d{2}$/, "Saat gerekli."),
  sure_dakika: z.coerce.number().int().min(5, "Süre en az 5 dakika olmalı.").max(480, "Süre en fazla 480 dakika olabilir."),
  /** Doluysa (Bekleyen Randevu Talepleri'nden açılan formda) randevu başarıyla
   *  oluşunca ilgili randevu_talebi satırı da onaylanmış olarak işaretlenir. */
  talep_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  /**
   * Yalnız randevuOlustur'da gönderilir (randevuGuncelle'de alan yok, optional
   * olduğu için undefined geçer) — seans tamamlanıp "Cariye Ekle"/"Ödeme Ekle"
   * ile bakiyeye işlenirken (randevu_seans_bedelini_isle) oluşan borç satırına
   * uygulanan, önceden planlanmış iskonto; bkz. randevu-formu.tsx.
   */
  planlanan_iskonto_tutari: negatifOlmayanTutarKurus("İskonto negatif olamaz.").optional(),
});

/**
 * Randevu Detay panelindeki "Tedavi Bilgileri" bloğu (Tanı/Antrenör/Tedavi
 * Protokolü) — üçü de opsiyonel, sadece randevuGuncelle'de kullanılıyor
 * (oluşturma formunda yok, kullanıcı kararıyla bu alanlar seans sırasında/
 * sonrasında doldurulacak bilgiler olarak ayrı tutuldu).
 */
const tedaviBilgileriSemasi = z.object({
  tani: z.string().trim().optional(),
  antrenor_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  tedavi_protokolu_id: z.union([z.string().uuid(), z.literal("")]).optional(),
});

export async function randevuOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const y = await yetkiAl(RANDEVU_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = randevuSemasi.safeParse({
    hasta_id: formData.get("hasta_id"),
    terapist_id: formData.get("terapist_id"),
    oda_id: formData.get("oda_id"),
    islem_tanimi_id: formData.get("islem_tanimi_id"),
    cihaz_id: formData.get("cihaz_id") ?? "",
    tarih: formData.get("tarih"),
    saat: formData.get("saat"),
    sure_dakika: formData.get("sure_dakika"),
    talep_id: formData.get("talep_id") ?? "",
    planlanan_iskonto_tutari: formData.get("planlanan_iskonto_tutari"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const {
    hasta_id,
    terapist_id,
    oda_id,
    islem_tanimi_id,
    cihaz_id,
    tarih,
    saat,
    sure_dakika,
    talep_id,
    planlanan_iskonto_tutari,
  } = ayristirma.data;

  let baslangicIso: string;
  try {
    baslangicIso = toUTC(`${tarih}T${saat}:00`);
  } catch {
    return { success: false, message: "Tarih/saat geçersiz." };
  }
  const bitisIso = new Date(new Date(baslangicIso).getTime() + sure_dakika * 60_000).toISOString();

  let yeniRandevuId: string;
  try {
    const sonuc = await withTenant(y.bag, async (tx) => {
      const kimlikHatasi = await randevuKimlikleriniDogrula(tx, { hastaId: hasta_id, terapistId: terapist_id, odaId: oda_id, islemTanimiId: islem_tanimi_id, cihazId: cihaz_id || null });
      if (kimlikHatasi) return { hata: kimlikHatasi };
      const terapistEngeli = await terapistTarihteAtanabilirMi(tx, terapist_id, tarih);
      if (terapistEngeli) return { hata: terapistEngeli };
      const [yeni] = await tx
        .insert(sema.randevu)
        .values({
          klinikId: y.klinikId,
          hastaId: hasta_id,
          terapistId: terapist_id,
          odaId: oda_id,
          islemTanimiId: islem_tanimi_id,
          cihazId: cihaz_id ? cihaz_id : null,
          baslangic: baslangicIso,
          bitis: bitisIso,
          olusturanKullaniciId: y.userId,
          planlananIskontoTutari: planlanan_iskonto_tutari ? kurusMetni(planlanan_iskonto_tutari) : null,
        })
        .returning({ id: sema.randevu.id });
      return { id: yeni.id };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Randevu oluşturulamadı." };
    yeniRandevuId = sonuc.id;
  } catch (e) {
    const h = pgHata(e);
    console.error("Randevu oluşturulamadı:", h.mesaj);
    if (h.kod === "23P01") {
      return {
        success: false,
        message: "Seçilen terapist, oda veya cihaz bu saatte dolu.",
      };
    }
    return { success: false, message: "Randevu oluşturulamadı, lütfen tekrar deneyin." };
  }

  if (talep_id) {
    // Talep onayı randevudan bağımsız denenir: hata randevuyu geri almaz (eski davranış).
    try {
      await withTenant(y.bag, (tx) =>
        tx
          .update(sema.randevuTalebi)
          .set({ durum: "onaylandi", olusturulanRandevuId: yeniRandevuId, yanitKullaniciId: y.userId, yanitTarihi: new Date().toISOString() })
          .where(eq(sema.randevuTalebi.id, talep_id))
      );
    } catch (e) {
      console.error("Randevu talebi güncellenemedi (randevu yine de oluşturuldu):", pgHata(e).mesaj);
    }
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  revalidateHastaDetay(hasta_id);
  after(() => randevuOlayMesajiTetikle(y.bag, yeniRandevuId, "randevu_onay"));
  return { success: true, message: "Randevu oluşturuldu." };
}

/** Bekleyen Randevu Talepleri kartındaki "Reddet" — iptalTalebiReddet ile aynı iskelet. */
export async function randevuTalebiReddet(talepId: string): Promise<SonucDurumu> {
  const y = await yetkiAl(YONETIM_ROLLERI); // RLS randevu_talebi_update_klinik ile aynı küme
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  try {
    const guncellenen = await withTenant(y.bag, (tx) =>
      tx
        .update(sema.randevuTalebi)
        .set({ durum: "reddedildi", yanitKullaniciId: y.userId, yanitTarihi: new Date().toISOString() })
        .where(eq(sema.randevuTalebi.id, talepId))
        .returning({ id: sema.randevuTalebi.id })
    );
    if (guncellenen.length === 0) return { success: false, message: "Randevu talebi bulunamadı." };
  } catch (e) {
    console.error("Randevu talebi reddedilemedi:", pgHata(e).mesaj);
    return { success: false, message: "İşlem başarısız, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  return { success: true, message: "Randevu talebi reddedildi." };
}

export async function randevuGuncelle(
  randevuId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const y = await yetkiAl(RANDEVU_ROLLERI); // terapist yalnız KENDİ randevusunu güncelleyebilir (RLS randevu_update_terapist_kendi)
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = randevuSemasi.safeParse({
    hasta_id: formData.get("hasta_id"),
    terapist_id: formData.get("terapist_id"),
    oda_id: formData.get("oda_id"),
    islem_tanimi_id: formData.get("islem_tanimi_id"),
    cihaz_id: formData.get("cihaz_id") ?? "",
    tarih: formData.get("tarih"),
    saat: formData.get("saat"),
    sure_dakika: formData.get("sure_dakika"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const tedaviBilgileriAyristirma = tedaviBilgileriSemasi.safeParse({
    tani: formData.get("tani") ?? "",
    antrenor_id: formData.get("antrenor_id") ?? "",
    tedavi_protokolu_id: formData.get("tedavi_protokolu_id") ?? "",
  });

  if (!tedaviBilgileriAyristirma.success) {
    return { success: false, message: "Tedavi bilgileri hatalı." };
  }

  const { hasta_id, terapist_id, oda_id, islem_tanimi_id, cihaz_id, tarih, saat, sure_dakika } = ayristirma.data;
  const { tani, antrenor_id, tedavi_protokolu_id } = tedaviBilgileriAyristirma.data;

  let baslangicIso: string;
  try {
    baslangicIso = toUTC(`${tarih}T${saat}:00`);
  } catch {
    return { success: false, message: "Tarih/saat geçersiz." };
  }
  const bitisIso = new Date(new Date(baslangicIso).getTime() + sure_dakika * 60_000).toISOString();

  try {
    const sonuc = await withTenant(y.bag, async (tx) => {
      const mevcut = (await tx.select({ durum: sema.randevu.durum, terapistId: sema.randevu.terapistId, baslangic: sema.randevu.baslangic }).from(sema.randevu).where(eq(sema.randevu.id, randevuId)).limit(1))[0];
      if (!mevcut) return { hata: "Randevu bulunamadı." };
      if (randevuKapaliMi(mevcut.durum)) return { hata: KAPALI_RANDEVU_MESAJI };

      const kimlikHatasi = await randevuKimlikleriniDogrula(tx, {
        hastaId: hasta_id,
        terapistId: terapist_id,
        odaId: oda_id,
        islemTanimiId: islem_tanimi_id,
        cihazId: cihaz_id || null,
        antrenorId: antrenor_id || null,
        tedaviProtokoluId: tedavi_protokolu_id || null,
      });
      if (kimlikHatasi) return { hata: kimlikHatasi };

      // Terapist ya da gün değiştiyse yeni terapist o gün çalışabilir olmalı (yalnız oda değişikliği
      // gibi düzenlemeler, terapist sonradan izin aldı diye engellenmesin).
      if (terapist_id !== mevcut.terapistId || formatDateForInput(new Date(mevcut.baslangic).toISOString()) !== tarih) {
        const terapistEngeli = await terapistTarihteAtanabilirMi(tx, terapist_id, tarih);
        if (terapistEngeli) return { hata: terapistEngeli };
      }

      const guncellenen = await tx
        .update(sema.randevu)
        .set({
          hastaId: hasta_id,
          terapistId: terapist_id,
          odaId: oda_id,
          islemTanimiId: islem_tanimi_id,
          cihazId: cihaz_id ? cihaz_id : null,
          baslangic: baslangicIso,
          bitis: bitisIso,
          tani: tani ? tani : null,
          antrenorId: antrenor_id ? antrenor_id : null,
          tedaviProtokoluId: tedavi_protokolu_id ? tedavi_protokolu_id : null,
        })
        .where(eq(sema.randevu.id, randevuId))
        .returning({ id: sema.randevu.id });
      // RLS yetkisiz UPDATE'i hata vermeden 0 satırla sonlandırır (ör. terapist başkasının randevusu): sessiz "güncellendi" dedirtme.
      if (guncellenen.length === 0) return { hata: YETKISIZ_MESAJI };
      return { tamam: true as const };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Randevu güncellenemedi." };
  } catch (e) {
    const h = pgHata(e);
    console.error("Randevu güncellenemedi:", h.mesaj);
    if (h.kod === "23P01") {
      return {
        success: false,
        message: "Seçilen terapist, oda veya cihaz bu saatte dolu.",
      };
    }
    return { success: false, message: "Randevu güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { success: true, message: "Randevu güncellendi." };
}

/**
 * "Geldi" / "Gecikmeli Geldi" — ayrı bir RPC üzerinden yapılır: durum
 * güncellemesiyle birlikte atomik olarak randevunun işlem_tanimi'ne göre
 * aktif bir paket varsa ondan 1 hak düşer (bkz. migration 20260731110000/
 * 20260731130000). 2026-09-27'den beri paketsiz check-in ARTIK bakiyeye
 * hiç dokunmuyor (kullanıcı kararı — bkz. migration 20260927150000, CLAUDE.md
 * > Cari) — seans bedeli yalnız seans TAMAMLANDIKTAN sonra "Cariye Ekle"/
 * "Ödeme Ekle" ile bakiyeye yazılır (randevuSeansBedeliniCariyeEkle/
 * randevuSeansOdemesiEkle, randevu_seans_bedelini_isle RPC'si). gecikmeDakika
 * verilirse durum 'gecikmeli_geldi' olur, ikisi de aynı paket mantığını
 * çalıştırır. Randevu Detay panelindeki 5 sonuç seçeneği (Geldi/Gecikmeli
 * Geldi/Gelmedi/Ertelendi/İptal) her zaman tıklanabilir olduğu için
 * (kullanıcı kararı) RPC içinde idempotency kontrolü var — bu fonksiyon aynı
 * randevu için birden çok kez çağrılsa bile paket mantığı sadece ilk seferde işler.
 */
export async function randevuGelisIsaretle(
  randevuId: string,
  gecikmeDakika: number | null
): Promise<SonucDurumu> {
  const y = await yetkiAl(RANDEVU_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  let sonuc: { yontem?: string; hasta_id?: string; tutar?: number; kalan_adet?: number } | null;
  try {
    sonuc = await withTenant(y.bag, async (tx) => (await rpc<{ randevu_gelis_isaretle: typeof sonuc }>(tx, "randevu_gelis_isaretle", { p_randevu_id: randevuId, p_gecikme_dakika: gecikmeDakika }))[0]?.randevu_gelis_isaretle ?? null);
  } catch (e) {
    const h = pgHata(e);
    console.error("Randevu geliş işaretlenemedi:", h.mesaj);
    if (h.mesaj.includes("randevu_kapali")) {
      return { success: false, message: KAPALI_RANDEVU_MESAJI };
    }
    if (h.kod === "23P01") {
      return { success: false, message: "Bu randevu için oda/terapist/cihaz bu saatte dolu." };
    }
    return { success: false, message: "Geliş işaretlenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");

  if (sonuc?.hasta_id) {
    revalidateHastaDetay(sonuc.hasta_id);
  }

  const gelisEtiketi = gecikmeDakika ? "Gecikmeli geliş" : "Geliş";
  const mesaj =
    sonuc?.yontem === "paket"
      ? `${gelisEtiketi} işaretlendi, paketten 1 hak düşüldü (kalan: ${sonuc.kalan_adet}).`
      : sonuc?.yontem === "zaten_islendi"
        ? "Durum güncellendi (paket bu randevu için zaten işlenmişti, tekrar işlenmedi)."
        : `${gelisEtiketi} işaretlendi.`;

  return { success: true, message: mesaj };
}

const seansBedelOdemeSemasi = z.object({
  tutar: pozitifTutarKurus(),
  tarih: z.string().min(1, "Tarih seçilmeli."),
  aciklama: z.string().trim().optional(),
  odeme_yontemi: z.enum(["nakit", "kredi_karti", "banka_havalesi"]),
  banka_hesap_id: z.string().trim().optional(),
  belge_turu: z.enum(["fatura", "fis", "serbest"]).optional().or(z.literal("")),
});

/** Seans bedeli işleme (cariye ekle / ödeme ekle) finansal işlemdir: yönetim rolleri (CLAUDE.md > Cari: Ödeme Ekle kartı klinik_admin/resepsiyon). */
const SEANS_BEDELI_ROLLERI: readonly PersonelRolu[] = ["klinik_admin", "resepsiyon"];

/**
 * Randevu Çizelgesi'nde tamamlanan bir seansın "Cariye Ekle" butonu — seans
 * bedelini (sunucuda hesaplanan etkin fiyat - planlanan iskonto) hiçbir ödeme
 * eklemeden borç olarak bakiyeye yazar (bkz. randevu_seans_bedelini_isle,
 * migration 20260927150000 — check-in artık bunu otomatik yapmıyor).
 */
export async function randevuSeansBedeliniCariyeEkle(randevuId: string): Promise<SonucDurumu> {
  const y = await yetkiAl(SEANS_BEDELI_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  let sonuc: { yontem?: string; hasta_id?: string } | null;
  try {
    sonuc = await withTenant(y.bag, async (tx) => (await rpc<{ randevu_seans_bedelini_isle: typeof sonuc }>(tx, "randevu_seans_bedelini_isle", { p_randevu_id: randevuId, p_belge_turu: null }))[0]?.randevu_seans_bedelini_isle ?? null);
  } catch (e) {
    const h = pgHata(e);
    console.error("Seans bedeli cariye eklenemedi:", h.mesaj);
    if (h.mesaj.includes("seans_tamamlanmamis")) {
      return { success: false, message: "Bu randevu henüz tamamlanmamış." };
    }
    return { success: false, message: "İşlem yapılamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");

  if (sonuc?.hasta_id) {
    revalidateHastaDetay(sonuc.hasta_id);
  }

  if (sonuc?.yontem === "zaten_islendi") {
    return { success: true, message: "Bu seansın bedeli zaten işlenmişti." };
  }

  return { success: true, message: "Seans bedeli cariye eklendi." };
}

/**
 * Randevu Çizelgesi'nde tamamlanan bir seansın "Ödeme Ekle" butonu — seans
 * bedelini borç olarak yazar VE aynı anda staff'ın girdiği tutarı ödeme
 * olarak işler (borç/ödeme eşleştirmesi yok, ikisi bağımsız satır — bkz.
 * CLAUDE.md > Cari). BakiyeHareketiEkleButonu'nun randevuId verilen hâli
 * bunu çağırır (bkz. bakiye-hareketi-formu.tsx).
 */
export async function randevuSeansOdemesiEkle(
  randevuId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const y = await yetkiAl(SEANS_BEDELI_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = seansBedelOdemeSemasi.safeParse({
    tutar: formData.get("tutar"),
    tarih: formData.get("tarih"),
    aciklama: formData.get("aciklama") ?? "",
    odeme_yontemi: formData.get("odeme_yontemi"),
    banka_hesap_id: formData.get("banka_hesap_id") ?? "",
    belge_turu: formData.get("belge_turu") ?? "",
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const { tutar, tarih, aciklama, odeme_yontemi, banka_hesap_id, belge_turu } = ayristirma.data;
  if (havaleHesapEksikMi(odeme_yontemi, banka_hesap_id)) {
    return { success: false, message: HAVALE_HESAP_GEREKLI_MESAJI };
  }

  let sonuc: { yontem?: string; hasta_id?: string } | null;
  try {
    sonuc = await withTenant(y.bag, async (tx) =>
      (
        await rpc<{ randevu_seans_bedelini_isle: typeof sonuc }>(tx, "randevu_seans_bedelini_isle", {
          p_randevu_id: randevuId,
          p_odeme_tutari: kurusMetni(tutar),
          p_odeme_yontemi: odeme_yontemi,
          p_banka_hesap_id: banka_hesap_id || null,
          p_aciklama: aciklama ? aciklama : null,
          p_odeme_tarihi: tarihiSimdikiSaatleUTC(tarih),
          p_belge_turu: belge_turu || null,
        })
      )[0]?.randevu_seans_bedelini_isle ?? null
    );
  } catch (e) {
    const h = pgHata(e);
    console.error("Seans ödemesi eklenemedi:", h.mesaj);
    if (h.mesaj.includes("seans_tamamlanmamis")) {
      return { success: false, message: "Bu randevu henüz tamamlanmamış." };
    }
    const bankaHatasi = bankaHesabiHatasiniCevir(h.mesaj);
    if (bankaHatasi) {
      return { success: false, message: bankaHatasi };
    }
    return { success: false, message: "Ödeme kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");

  if (sonuc?.hasta_id) {
    revalidateHastaDetay(sonuc.hasta_id);
  }

  // RPC zaten işlenmiş bir seansta erken döner ve ödeme satırını da YAZMAZ
  // (çift tıklamada mükerrer ödeme olmasın diye) — bunu başarı gibi
  // raporlarsak girilen ödeme sessizce kaybolur.
  if (sonuc?.yontem === "zaten_islendi") {
    return {
      success: false,
      message: "Bu seansın bedeli zaten işlenmiş, ödeme kaydedilmedi. Ödemeyi hastanın Cari & Ödeme sekmesinden ekleyin.",
    };
  }

  if (sonuc?.hasta_id) {
    const hastaId = sonuc.hasta_id;
    after(() => odemeAlindiMesajiTetikle(y.bag, hastaId, tutar / 100, { randevuId }));
  }
  return { success: true, message: "Ödeme kaydedildi." };
}

/** "Gelmedi" — düz durum güncellemesi (paket/bakiyeye dokunmaz). İptal için bkz. randevuIptalEt. */
export async function randevuDurumGuncelle(
  randevuId: string,
  yeniDurum: Extract<RandevuDurum, "gelmedi">
): Promise<SonucDurumu> {
  if (yeniDurum !== "gelmedi") {
    return null;
  }

  const y = await yetkiAl(RANDEVU_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  // RPC: check-in'de paketten düşülen hak iade edilir, iptal/tamamlanmış randevu reddedilir (migration 20261012160000).
  let sonuc: { hasta_id?: string; paket_iade?: boolean } | null;
  try {
    sonuc = await withTenant(y.bag, async (tx) => (await rpc<{ randevu_gelmedi_isaretle: typeof sonuc }>(tx, "randevu_gelmedi_isaretle", { p_randevu_id: randevuId }))[0]?.randevu_gelmedi_isaretle ?? null);
  } catch (e) {
    const h = pgHata(e);
    console.error("Randevu durumu güncellenemedi:", h.mesaj);
    if (h.mesaj.includes("randevu_kapali")) {
      return { success: false, message: KAPALI_RANDEVU_MESAJI };
    }
    return { success: false, message: "Randevu durumu güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  if (sonuc?.hasta_id) {
    revalidateHastaDetay(sonuc.hasta_id);
  }
  after(() => randevuOlayMesajiTetikle(y.bag, randevuId, "randevu_gelmedi"));
  return {
    success: true,
    message: sonuc?.paket_iade
      ? "Gelmedi olarak işaretlendi; check-in'de düşülen paket hakkı iade edildi."
      : "Randevu durumu güncellendi.",
  };
}

function iptalHatasiMesaji(mesaj: string | undefined): string | null {
  if (!mesaj) return null;
  if (mesaj.includes("tamamlanmis_randevu_iptal_edilemez")) return "Tamamlanmış seans iptal edilemez.";
  if (mesaj.includes("yetkisiz")) return "Bu işlem için yetkiniz yok (bedelli iptal yalnızca yönetici/resepsiyon).";
  return null;
}

function iptalSonucMesaji(
  sonuc: { bedelli?: boolean; paket_dusuldu?: boolean; borc_yazildi?: boolean; paket_iade?: boolean } | null
): string {
  if (!sonuc?.bedelli) {
    return sonuc?.paket_iade
      ? "Randevu bedelsiz iptal edildi; check-in'de düşülen paket hakkı iade edildi."
      : "Randevu bedelsiz iptal edildi.";
  }
  if (sonuc.paket_dusuldu) return "Randevu bedelli iptal edildi; paketten 1 seans düşüldü.";
  if (sonuc.borc_yazildi) return "Randevu bedelli iptal edildi; seans bedeli bakiyeye işlendi.";
  return "Randevu bedelli iptal edildi.";
}

/**
 * Randevuyu iptal eder (açıklamalı). `bedelli`: personelin seçimi — bedelli iptalde
 * hastanın uygun paketinden 1 hak düşer, paket yoksa seans bedeli bakiyeye borç
 * yazılır ve açıklamaya "(geç iptal)" eklenir; bedelsiz iptal hiçbir şeye dokunmaz.
 */
export async function randevuIptalEt(
  randevuId: string,
  aciklama: string,
  bedelli: boolean
): Promise<SonucDurumu> {
  const y = await yetkiAl(RANDEVU_ROLLERI); // bedelli iptal yetkisi RPC içinde yönetici/resepsiyonla sınırlı
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  type IptalSonucu = { hasta_id?: string; bedelli?: boolean; paket_dusuldu?: boolean; borc_yazildi?: boolean; paket_iade?: boolean } | null;
  let sonuc: IptalSonucu;
  try {
    sonuc = await withTenant(y.bag, async (tx) =>
      (await rpc<{ randevu_iptal_et: IptalSonucu }>(tx, "randevu_iptal_et", { p_randevu_id: randevuId, p_aciklama: aciklama.trim() || null, p_bedelli: bedelli, p_gec_iptal: null }))[0]?.randevu_iptal_et ?? null
    );
  } catch (e) {
    const h = pgHata(e);
    console.error("Randevu iptal edilemedi:", h.mesaj);
    return { success: false, message: iptalHatasiMesaji(h.mesaj) ?? "Randevu iptal edilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  if (sonuc?.hasta_id) {
    revalidateHastaDetay(sonuc.hasta_id);
  }
  after(() => randevuOlayMesajiTetikle(y.bag, randevuId, "randevu_iptal"));
  return { success: true, message: iptalSonucMesaji(sonuc) };
}

/** Yönetici: mantıklı bir sebeple iptal edilen randevuyu geri alır (düşülen paket hakkı iade edilir). */
export async function randevuIptalGeriAl(randevuId: string): Promise<SonucDurumu> {
  const y = await yetkiAl(["klinik_admin"]); // RPC de yalnız klinik_admin'e izin verir
  if (!y) return { success: false, message: "İptali yalnızca yönetici geri alabilir." };

  let sonuc: { hasta_id?: string; paket_iade?: boolean; borc_silindi?: boolean } | null;
  try {
    sonuc = await withTenant(y.bag, async (tx) => (await rpc<{ randevu_iptal_geri_al: typeof sonuc }>(tx, "randevu_iptal_geri_al", { p_randevu_id: randevuId }))[0]?.randevu_iptal_geri_al ?? null);
  } catch (e) {
    const h = pgHata(e);
    console.error("Randevu iptali geri alınamadı:", h.mesaj);
    if (h.kod === "23P01") {
      return { success: false, message: "Bu saatte terapist, oda veya cihaz başka bir randevuya ayrılmış, geri alınamadı." };
    }
    if (h.mesaj.includes("yetkisiz")) {
      return { success: false, message: "İptali yalnızca yönetici geri alabilir." };
    }
    if (h.mesaj.includes("borc_faturali_geri_alinamaz")) {
      return { success: false, message: "İptalde yazılan borç faturalanmış, geri alınamaz. Önce faturayı/borcu düzeltin." };
    }
    return { success: false, message: "İptal geri alınamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  if (sonuc?.hasta_id) {
    revalidateHastaDetay(sonuc.hasta_id);
  }
  return {
    success: true,
    message: sonuc?.paket_iade
      ? "İptal geri alındı; düşülen paket hakkı iade edildi."
      : sonuc?.borc_silindi
        ? "İptal geri alındı; iptalde yazılan seans bedeli bakiyeden silindi."
        : "İptal geri alındı.",
  };
}

const ertelemeSemasi = z.object({
  tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih gerekli."),
  saat: z.string().regex(/^\d{2}:\d{2}$/, "Saat gerekli."),
});

/**
 * "Ertelendi" — girilen yeni tarih/saat DOĞRUDAN randevunun baslangic/
 * bitis'ine işlenir (aynı süre korunarak), durum 'ertelendi' olur. Ayrı bir
 * randevu OLUŞTURULMAZ, aynı satır yeni zamana taşınır (kullanıcı kararı) —
 * bu yüzden oda/terapist/cihaz çakışma kontrolü yeni zaman için normal
 * şekilde yeniden çalışır (23P01).
 */
export async function randevuErtele(randevuId: string, formData: FormData): Promise<SonucDurumu> {
  const y = await yetkiAl(RANDEVU_ROLLERI); // terapist yalnız kendi randevusunu erteleyebilir (RLS)
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = ertelemeSemasi.safeParse({
    tarih: formData.get("tarih"),
    saat: formData.get("saat"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  let yeniBaslangicIso: string;
  try {
    yeniBaslangicIso = toUTC(`${ayristirma.data.tarih}T${ayristirma.data.saat}:00`);
  } catch {
    return { success: false, message: "Tarih/saat geçersiz." };
  }

  let hastaId: string;
  try {
    const sonuc = await withTenant(y.bag, async (tx) => {
      const mevcut = (
        await tx
          .select({ baslangic: sema.randevu.baslangic, bitis: sema.randevu.bitis, hastaId: sema.randevu.hastaId, durum: sema.randevu.durum, terapistId: sema.randevu.terapistId })
          .from(sema.randevu)
          .where(eq(sema.randevu.id, randevuId))
          .limit(1)
      )[0];
      if (!mevcut) return { hata: "Randevu bulunamadı." };
      if (randevuKapaliMi(mevcut.durum)) return { hata: KAPALI_RANDEVU_MESAJI };

      const terapistEngeli = await terapistTarihteAtanabilirMi(tx, mevcut.terapistId, ayristirma.data.tarih);
      if (terapistEngeli) return { hata: terapistEngeli };

      const sureMs = new Date(mevcut.bitis).getTime() - new Date(mevcut.baslangic).getTime();
      const yeniBitisIso = new Date(new Date(yeniBaslangicIso).getTime() + sureMs).toISOString();

      const guncellenen = await tx
        .update(sema.randevu)
        .set({ baslangic: yeniBaslangicIso, bitis: yeniBitisIso, durum: "ertelendi" })
        .where(eq(sema.randevu.id, randevuId))
        .returning({ id: sema.randevu.id });
      if (guncellenen.length === 0) return { hata: YETKISIZ_MESAJI };
      return { eski: new Date(mevcut.baslangic).toISOString(), hastaId: mevcut.hastaId };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Randevu ertelenemedi." };
    hastaId = sonuc.hastaId;
  } catch (e) {
    const h = pgHata(e);
    console.error("Randevu ertelenemedi:", h.mesaj);
    if (h.kod === "23P01") {
      return { success: false, message: "Seçilen yeni saatte terapist, oda veya cihaz dolu." };
    }
    return { success: false, message: "Randevu ertelenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  revalidateHastaDetay(hastaId);
  after(() => randevuOlayMesajiTetikle(y.bag, randevuId, "randevu_iptal"));
  return {
    success: true,
    message: `Randevu ${ayristirma.data.tarih} ${ayristirma.data.saat} saatine ertelendi.`,
  };
}

const seansTamamlaSemasi = z.object({
  aciklama: z.string().trim().min(1, "İşlem açıklaması gerekli."),
});

/**
 * "Seansı Bitir" — randevu.durum='tamamlandi' yapar, açıklamayı ve
 * tamamlayanı (client'tan gelen değere göre değil, oturumdaki kullanıcının
 * kimliğine göre) kaydeder. Hasta Detay > Seans Geçmişi'ndeki mevcut
 * "Seansı Tamamla" formu (useSeansTamamla) ve Randevu Detay Paneli'ndeki
 * "Seansı Bitir" butonu artık İKİSİ DE bu tek fonksiyonu çağırıyor — hangi
 * yoldan tetiklenirse tetiklensin oda tabletindeki canlı abonelik aynı
 * 'tamamlandi' durumunu görüp seans sonu anket QR'ını gösteriyor.
 * Geliş işleme (gerekirse) ve tamamlama TEK transaction'da yapılır: paketten hak düşüp seans tamamlanmamış yarım durum kalmaz.
 */
export async function randevuSeansiTamamla(randevuId: string, aciklama: string): Promise<SonucDurumu> {
  const ayristirma = seansTamamlaSemasi.safeParse({ aciklama });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Açıklama gerekli." };
  }
  const y = await yetkiAl(RANDEVU_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  let veri: { hataMesaji?: string; paketMesaji: string | null; hastaId?: string; paketSatisId?: string | null };
  try {
    veri = await withTenant(y.bag, async (tx) => {
      const mevcut = (await tx.select({ durum: sema.randevu.durum }).from(sema.randevu).where(eq(sema.randevu.id, randevuId)).limit(1))[0];
      if (!mevcut) return { hataMesaji: "Randevu bulunamadı.", paketMesaji: null };
      if (mevcut.durum === "tamamlandi") return { hataMesaji: "Bu seans zaten tamamlanmış.", paketMesaji: null };
      if (mevcut.durum === "iptal") return { hataMesaji: KAPALI_RANDEVU_MESAJI, paketMesaji: null };

      // Seans bittiyse hasta gelmiştir: check-in yapılmadan "Seansı Bitir" denirse önce geliş işlenir.
      // Aksi halde paketli hastanın paketinden hak hiç düşmüyor, "Cariye Ekle" de seansı paketsiz sayıp
      // tam ücreti borç yazıyordu (hasta hem paketini koruyor hem ücretlendiriliyordu).
      let paketMesaji: string | null = null;
      if (mevcut.durum !== "geldi" && mevcut.durum !== "gecikmeli_geldi") {
        const gelis = (await rpc<{ randevu_gelis_isaretle: { yontem?: string; kalan_adet?: number } | null }>(tx, "randevu_gelis_isaretle", { p_randevu_id: randevuId, p_gecikme_dakika: null }))[0]?.randevu_gelis_isaretle;
        if (gelis?.yontem === "paket") paketMesaji = `Paketten 1 hak düşüldü (kalan: ${gelis.kalan_adet}).`;
      }

      const guncellenen = await tx
        .update(sema.randevu)
        .set({ durum: "tamamlandi", tamamlanmaAciklamasi: ayristirma.data.aciklama, tamamlayanKullaniciId: y.userId, tamamlanmaTarihi: new Date().toISOString() })
        .where(and(eq(sema.randevu.id, randevuId), inArray(sema.randevu.durum, ["geldi", "gecikmeli_geldi"])))
        .returning({ hastaId: sema.randevu.hastaId, paketSatisId: sema.randevu.paketSatisId });
      if (guncellenen.length === 0) throw new Error("tamamlanamadi"); // yetkisiz (RLS) ya da durum değişmiş: geliş işlemini de geri al
      return { paketMesaji, hastaId: guncellenen[0].hastaId, paketSatisId: guncellenen[0].paketSatisId };
    });
  } catch (e) {
    const h = pgHata(e);
    console.error("Seans tamamlanamadı:", h.mesaj);
    return {
      success: false,
      message:
        h.kod === "23P01"
          ? "Bu saatte oda/terapist/cihaz başka bir randevuya ayrılmış; önce randevuyu düzeltin."
          : "Seans tamamlanamadı, lütfen tekrar deneyin.",
    };
  }
  if (veri.hataMesaji) return { success: false, message: veri.hataMesaji };

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  if (veri.hastaId) {
    revalidateHastaDetay(veri.hastaId);
  }

  const paketUyarisi = veri.paketSatisId ? await paketYenilemeUyarisiIsle(y.bag, veri.paketSatisId, randevuId) : null;

  return {
    success: true,
    message: ["Seans tamamlandı.", veri.paketMesaji, paketUyarisi].filter(Boolean).join(" "),
  };
}

/**
 * Paketten düşülmüş bir seans bitince kalan hak 1-2 ise (bkz.
 * lib/paket/yenileme-esigi.ts) hastaya "yenileyin" mesajını kuyruğa yazar ve
 * çağırana işlem sonucuna eklenecek kısa bir uyarı metni döner. Kalan hak
 * check-in'de düşmüş olduğundan burada güncel değer okunur.
 *
 * Best-effort: mesajlaşma/okuma hatası seansın tamamlanmasını ASLA etkilemez
 * (seans zaten yazıldı) — hata loglanır, uyarı metni yine de dönmeye çalışır.
 * Mesaj idempotency anahtarı (paket + kalan hak) sayesinde aynı seviye için
 * tek kez kuyruğa girer; kural yoksa/pasifse kuyruğa hiç yazılmaz.
 */
async function paketYenilemeUyarisiIsle(bag: TenantBaglami, paketSatisId: string, randevuId: string): Promise<string | null> {
  try {
    return await withTenant(bag, async (tx) => {
      const satis = (
        await tx
          // paket_satis'e terapistin SELECT'i yok (0017): kalan hak/paket adı dar görünümden, hasta iletişimi randevu üzerinden okunur.
          .select({
            kalanAdet: sema.vRandevuKapanis.paketKalanAdet,
            klinikId: sema.randevu.klinikId,
            hastaId: sema.hasta.id,
            hastaAd: sema.hasta.adSoyad,
            telefon: sema.hasta.telefon,
            eposta: sema.hasta.eposta,
            wp: sema.hasta.whatsappIzinDurumu,
            paketAd: sema.vRandevuKapanis.paketAd,
          })
          .from(sema.randevu)
          .innerJoin(sema.vRandevuKapanis, eq(sema.vRandevuKapanis.randevuId, sema.randevu.id))
          .leftJoin(sema.hasta, eq(sema.hasta.id, sema.randevu.hastaId))
          .where(and(eq(sema.randevu.id, randevuId), eq(sema.randevu.paketSatisId, paketSatisId)))
          .limit(1)
      )[0];

      if (!satis || satis.kalanAdet == null || !paketYenilemeGerekliMi(satis.kalanAdet)) return null;

      const paketAdi = satis.paketAd ?? "Paket";
      const uyari = `${paketAdi} paketinde ${satis.kalanAdet} seans kaldı — hastaya yenileme hatırlatması yapın.`;

      if (satis.hastaId) {
        const klinik = (await tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, satis.klinikId)).limit(1))[0];
        await anlikMesajTetikle(tx, {
          klinikId: satis.klinikId,
          tetikleyiciKodu: "hasta_paket_seans_azaldi",
          aliciTipi: "hasta",
          aliciId: satis.hastaId,
          adres: { telefon: satis.telefon, eposta: satis.eposta, whatsappIzni: satis.wp ?? false },
          klinikAdi: klinik?.ad ?? "",
          idempotencyTemeli: `hasta_paket_seans_azaldi:${paketSatisId}:${satis.kalanAdet}`,
        });
      }

      return uyari;
    });
  } catch (hata) {
    console.error(`Paket yenileme uyarısı işlenemedi (randevu ${randevuId}):`, hata);
    return null;
  }
}

type SonucDurumu2 = { success: boolean; message: string } | null;

export async function iptalTalebiOnayla(talepId: string, randevuId: string, bedelli: boolean): Promise<SonucDurumu2> {
  const y = await yetkiAl(YONETIM_ROLLERI); // RLS randevu_iptal_talebi_update_klinik ile aynı küme
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  try {
    const sonuc = await withTenant(y.bag, async (tx) => {
      const talep = (
        await tx
          .select({ randevuId: sema.randevuIptalTalebi.randevuId, durum: sema.randevuIptalTalebi.durum, aciklama: sema.randevuIptalTalebi.aciklama, gecIptal: sema.randevuIptalTalebi.gecIptal })
          .from(sema.randevuIptalTalebi)
          .where(eq(sema.randevuIptalTalebi.id, talepId))
          .limit(1)
      )[0];

      // Talep bu randevuya ait ve hâlâ bekliyor olmalı — aksi halde istemciden gelen randevuId ile
      // başka bir randevu iptal edilebilir ya da aynı talep iki kez işlenebilirdi.
      if (!talep || talep.randevuId !== randevuId) return { hata: "İptal talebi bulunamadı." };
      if (talep.durum !== "bekliyor") return { hata: "Bu iptal talebi zaten yanıtlanmış (sayfayı yenileyin)." };

      // Bedelli/bedelsiz kararı onaylayan personelden gelir; talebin geç iptal bilgisi yalnız kayıt içindir.
      await rpc(tx, "randevu_iptal_et", { p_randevu_id: randevuId, p_aciklama: talep.aciklama ?? "Hasta portalı iptal talebi", p_bedelli: bedelli, p_gec_iptal: talep.gecIptal ?? null });
      const guncellenen = await tx
        .update(sema.randevuIptalTalebi)
        .set({ durum: "onaylandi", yanitKullaniciId: y.userId, yanitTarihi: new Date().toISOString() })
        .where(eq(sema.randevuIptalTalebi.id, talepId))
        .returning({ id: sema.randevuIptalTalebi.id });
      if (guncellenen.length === 0) throw new Error("talep_guncellenemedi"); // iptal de geri alınır
      return { tamam: true as const };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "İptal talebi onaylanamadı." };
  } catch (e) {
    console.error("İptal talebi onaylanamadı:", pgHata(e).mesaj);
    return { success: false, message: "İptal talebi onaylanamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  after(() => randevuOlayMesajiTetikle(y.bag, randevuId, "randevu_iptal"));
  return { success: true, message: "Randevu iptal edildi." };
}

export async function iptalTalebiReddet(talepId: string): Promise<SonucDurumu2> {
  const y = await yetkiAl(YONETIM_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  try {
    const guncellenen = await withTenant(y.bag, (tx) =>
      tx
        .update(sema.randevuIptalTalebi)
        .set({ durum: "reddedildi", yanitKullaniciId: y.userId, yanitTarihi: new Date().toISOString() })
        .where(eq(sema.randevuIptalTalebi.id, talepId))
        .returning({ id: sema.randevuIptalTalebi.id })
    );
    if (guncellenen.length === 0) return { success: false, message: "İptal talebi bulunamadı." };
  } catch (e) {
    console.error("İptal talebi reddedilemedi:", pgHata(e).mesaj);
    return { success: false, message: "İşlem başarısız, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  return { success: true, message: "İptal talebi reddedildi." };
}

type PeriyodikSonucu = {
  success: boolean;
  message: string;
  cakismalar?: { tarihEtiketi: string; whatsappLink: string }[];
} | null;

/** Periyodik randevu serisinin varsayılan/yenileme süresi (ay). */
const PERIYODIK_SURE_AY = 5;

const gunSaatSemasi = z.object({
  gun: z.coerce.number().int().min(0).max(6),
  saat: z.string().min(1),
});

/**
 * Haftada birden fazla gün seçilebilir (kullanıcı kararı) — her gün/saat
 * çifti için ayrı bir periyodik_randevu serisi açılır (bkz. periyodikRandevuOlustur),
 * bu yüzden aynı gün+saat ikilisi tekrar edemez.
 */
const periyodikSemasi = z.object({
  hasta_id: z.string().uuid("Hasta seçilmeli."),
  terapist_id: z.string().uuid("Dr / Terapist seçilmeli."),
  oda_id: z.string().uuid("Oda seçilmeli."),
  islem_tanimi_id: z.string().uuid("Tedavi seçilmeli."),
  cihaz_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  gunler: z
    .array(gunSaatSemasi)
    .min(1, "En az bir gün ve saat seçilmeli.")
    .max(7, "En fazla 7 gün seçilebilir.")
    .refine(
      (arr) => new Set(arr.map((g) => `${g.gun}-${g.saat}`)).size === arr.length,
      { message: "Aynı gün ve saat birden fazla kez seçilemez." }
    ),
  sure_dakika: z.coerce
    .number()
    .int()
    .min(5, "Süre en az 5 dakika olmalı.")
    .max(480, "Süre en fazla 480 dakika olabilir."),
});

const periyodikGuncelleSemasi = z.object({
  haftanin_gunu: z.coerce.number().int().min(0).max(6),
  saat: z.string().min(1, "Saat gerekli."),
  uzat: z.union([z.literal("on"), z.literal("")]).optional(),
});

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

type TarihBilesen = { yil: number; ay: number; gun: number };

/** Türkiye sabit UTC+3 (DST yok) — bir UTC anının İstanbul takvim bileşenleri. */
function istanbulTarihBilesenleri(d: Date): TarihBilesen {
  const kaydirilmis = new Date(d.getTime() + ISTANBUL_OFFSET_MS);
  return {
    yil: kaydirilmis.getUTCFullYear(),
    ay: kaydirilmis.getUTCMonth(),
    gun: kaydirilmis.getUTCDate(),
  };
}

function tarihStr(yil: number, ay: number, gun: number) {
  const d = new Date(Date.UTC(yil, ay, gun));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function tarihStrAyristir(deger: string): TarihBilesen {
  const [yil, ay, gun] = deger.split("-").map(Number);
  return { yil, ay: ay - 1, gun };
}

function bilesenKarsilastir(a: TarihBilesen, b: TarihBilesen) {
  return Date.UTC(a.yil, a.ay, a.gun) - Date.UTC(b.yil, b.ay, b.gun);
}

function enSonBilesen(a: TarihBilesen, b: TarihBilesen) {
  return bilesenKarsilastir(a, b) >= 0 ? a : b;
}

function gunEkle(bilesen: TarihBilesen, n: number): TarihBilesen {
  const d = new Date(Date.UTC(bilesen.yil, bilesen.ay, bilesen.gun + n));
  return { yil: d.getUTCFullYear(), ay: d.getUTCMonth(), gun: d.getUTCDate() };
}

function ayEkle(bilesen: TarihBilesen, ayAdedi: number): TarihBilesen {
  const d = new Date(Date.UTC(bilesen.yil, bilesen.ay + ayAdedi, bilesen.gun));
  return { yil: d.getUTCFullYear(), ay: d.getUTCMonth(), gun: d.getUTCDate() };
}

/**
 * Verilen [baslangicBilesen, bitisBilesen] tarih aralığında haftaninGunu'na
 * denk gelen her gün için somut bir randevu satırı üretir. Bir gün oda/
 * terapist/cihaz çakışması nedeniyle oluşturulamazsa (23P01) o gün atlanır
 * ve hastaya saat değişikliği için tıkla-gönder WhatsApp linki üretilir
 * (gerçek WhatsApp Business API entegrasyonu henüz kurulmadı, bkz.
 * lib/utils.ts whatsappLinkOlustur — portal geçici şifre akışıyla aynı
 * desen). Geçmişte kalan adaylar sessizce atlanır.
 */
async function periyodikSatirlariUret(params: {
  tx: Tx;
  klinikId: string;
  periyodikId: string;
  hastaId: string;
  hastaAdSoyad: string;
  hastaTelefon: string;
  terapistId: string;
  odaId: string;
  cihazId: string | null;
  islemTanimiId: string;
  haftaninGunu: number;
  saat: string;
  sureDakika: number;
  baslangicBilesen: TarihBilesen;
  bitisBilesen: TarihBilesen;
  userId: string;
  /** Terapistin çıkış/izin günleri — o günler randevu yazılmaz, çakışma gibi raporlanır. */
  uygunluk: TerapistUygunluk | null;
}) {
  const {
    tx,
    klinikId,
    periyodikId,
    hastaId,
    hastaAdSoyad,
    hastaTelefon,
    terapistId,
    odaId,
    cihazId,
    islemTanimiId,
    haftaninGunu,
    saat,
    sureDakika,
    baslangicBilesen,
    bitisBilesen,
    userId,
    uygunluk,
  } = params;

  const simdi = new Date();
  const basariliTarihler: string[] = [];
  const cakismalar: { tarihEtiketi: string; whatsappLink: string }[] = [];

  const gunSayisi =
    Math.round(
      (Date.UTC(bitisBilesen.yil, bitisBilesen.ay, bitisBilesen.gun) -
        Date.UTC(baslangicBilesen.yil, baslangicBilesen.ay, baslangicBilesen.gun)) /
        86_400_000
    ) + 1;

  for (let i = 0; i < gunSayisi; i++) {
    const adayTarih = new Date(Date.UTC(baslangicBilesen.yil, baslangicBilesen.ay, baslangicBilesen.gun + i));
    if (adayTarih.getUTCDay() !== haftaninGunu) continue;

    const tarihStrDeger = tarihStr(adayTarih.getUTCFullYear(), adayTarih.getUTCMonth(), adayTarih.getUTCDate());

    let baslangicIso: string;
    try {
      baslangicIso = toUTC(`${tarihStrDeger}T${saat}:00`);
    } catch {
      continue;
    }

    if (new Date(baslangicIso).getTime() < simdi.getTime()) continue;

    if (uygunluk && terapistGunEngeli(uygunluk, tarihStrDeger)) {
      const tarihEtiketiEngel = new Date(baslangicIso).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Istanbul",
      });
      const mesaj = `Merhaba ${hastaAdSoyad}, ${tarihEtiketiEngel} için planladığımız periyodik randevunuzda terapistiniz o gün müsait değil. Sizinle birlikte bu hafta için alternatif bir saat belirleyebilir miyiz?`;
      cakismalar.push({ tarihEtiketi: `${tarihEtiketiEngel} (terapist müsait değil)`, whatsappLink: whatsappLinkOlustur(hastaTelefon, mesaj) });
      continue;
    }

    const bitisIso = new Date(new Date(baslangicIso).getTime() + sureDakika * 60_000).toISOString();

    // Her satır kendi SAVEPOINT'inde: beklenen çakışma (23P01) dış transaction'ı bozmaz, sonraki haftalar denenmeye devam eder.
    let randevuHata: { kod: string | null; mesaj: string } | null = null;
    try {
      await tx.transaction((sp) =>
        sp.insert(sema.randevu).values({
          klinikId,
          hastaId,
          terapistId,
          odaId,
          cihazId,
          islemTanimiId,
          periyodikRandevuId: periyodikId,
          baslangic: baslangicIso,
          bitis: bitisIso,
          olusturanKullaniciId: userId,
        })
      );
    } catch (e) {
      const h = pgHata(e);
      randevuHata = { kod: h.kod, mesaj: h.mesaj };
    }

    const tarihEtiketi = new Date(baslangicIso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Istanbul",
    });

    if (randevuHata) {
      if (randevuHata.kod === "23P01") {
        const mesaj = `Merhaba ${hastaAdSoyad}, ${tarihEtiketi} için planladığımız periyodik randevunuzda o saatte oda/terapist uygun değil. Sizinle birlikte bu hafta için alternatif bir saat belirleyebilir miyiz?`;
        cakismalar.push({ tarihEtiketi, whatsappLink: whatsappLinkOlustur(hastaTelefon, mesaj) });
        continue;
      }
      console.error("Periyodik randevu satırı oluşturulamadı:", randevuHata.mesaj);
      continue;
    }

    basariliTarihler.push(tarihEtiketi);
  }

  return { basariliTarihler, cakismalar };
}

/**
 * Periyodik randevu: haftanın belirli günü+saatinde tekrar eden randevu.
 * Gerçek "iptal edilene kadar sonsuza dek otomatik üret" için pg_cron/Edge
 * Function gerekir — bu proje henüz böyle bir zamanlanmış iş altyapısı
 * kurmadı (bkz. migration notu, Paraşüt'teki aynı gerekçe). Bunun yerine
 * seri sabit PERIYODIK_SURE_AY (5 ay) süreyle açılır; bu pencere içindeki
 * her gün için somut randevu satırı üretilir. Süre bitimine 2 hafta kala
 * Hasta Detay'daki kart bir uyarı gösterir (bkz. periyodikRandevuGuncelle).
 */
export async function periyodikRandevuOlustur(
  _onceki: PeriyodikSonucu,
  formData: FormData
): Promise<PeriyodikSonucu> {
  const y = await yetkiAl(RANDEVU_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  let gunlerRaw: unknown;
  try {
    gunlerRaw = JSON.parse(String(formData.get("gunler_json") ?? "[]"));
  } catch {
    return { success: false, message: "Gün/saat bilgisi hatalı." };
  }

  const ayristirma = periyodikSemasi.safeParse({
    hasta_id: formData.get("hasta_id"),
    terapist_id: formData.get("terapist_id"),
    oda_id: formData.get("oda_id"),
    islem_tanimi_id: formData.get("islem_tanimi_id"),
    cihaz_id: formData.get("cihaz_id") ?? "",
    gunler: gunlerRaw,
    sure_dakika: formData.get("sure_dakika"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { hasta_id, terapist_id, oda_id, islem_tanimi_id, cihaz_id, gunler, sure_dakika } = ayristirma.data;

  const bugun = istanbulTarihBilesenleri(new Date());
  const bitisBilesen = ayEkle(bugun, PERIYODIK_SURE_AY);
  const bitisTarihiStr = tarihStr(bitisBilesen.yil, bitisBilesen.ay, bitisBilesen.gun);
  const cihazIdDegeri = cihaz_id ? cihaz_id : null;

  // Haftada birden fazla gün seçilmişse (kullanıcı kararı) her gün/saat
  // çifti için ayrı bir periyodik_randevu serisi açılır — Hasta Detay'da
  // ayrı ayrı listelenip düzenlenebilir/iptal edilebilir olsun diye.
  // Tek transaction: beklenen çakışma hataları (23P01) satır başına SAVEPOINT'te yakalanır, transaction bozulmaz.
  try {
    const sonuc = await withTenant(y.bag, async (tx) => {
      const kimlikHatasi = await randevuKimlikleriniDogrula(tx, { hastaId: hasta_id, terapistId: terapist_id, odaId: oda_id, islemTanimiId: islem_tanimi_id, cihazId: cihazIdDegeri });
      if (kimlikHatasi) return { hata: kimlikHatasi };
      if (!(await terapistAtanabilirMi(tx, terapist_id))) return { hata: "Seçilen terapist işten ayrılmış, randevu atanamaz." };

      const hasta = (await tx.select({ adSoyad: sema.hasta.adSoyad, telefon: sema.hasta.telefon }).from(sema.hasta).where(eq(sema.hasta.id, hasta_id)).limit(1))[0];
      if (!hasta) return { hata: "Hasta bulunamadı." };

      const uygunluk = await terapistUygunlukGetir(tx, terapist_id, tarihStr(bugun.yil, bugun.ay, bugun.gun), bitisTarihiStr);

      const toplamBasariliTarihler: string[] = [];
      const toplamCakismalar: { tarihEtiketi: string; whatsappLink: string }[] = [];
      const eklenemeyenGunler: string[] = [];

      for (const g of gunler) {
        let periyodikId: string | null = null;
        try {
          const [periyodik] = await tx.transaction((sp) =>
            sp
              .insert(sema.periyodikRandevu)
              .values({
                klinikId: y.klinikId,
                hastaId: hasta_id,
                terapistId: terapist_id,
                odaId: oda_id,
                cihazId: cihazIdDegeri,
                islemTanimiId: islem_tanimi_id,
                haftaninGunu: g.gun,
                saat: g.saat,
                sureDakika: sure_dakika,
                bitisTarihi: bitisTarihiStr,
                olusturanKullaniciId: y.userId,
              })
              .returning({ id: sema.periyodikRandevu.id })
          );
          periyodikId = periyodik?.id ?? null;
        } catch (e) {
          console.error("Periyodik randevu günü oluşturulamadı:", pgHata(e).mesaj);
        }
        if (!periyodikId) {
          eklenemeyenGunler.push(GUN_ETIKETI[g.gun as HaftaninGunu]);
          continue;
        }

        const { basariliTarihler, cakismalar } = await periyodikSatirlariUret({
          tx,
          klinikId: y.klinikId,
          periyodikId,
          hastaId: hasta_id,
          hastaAdSoyad: hasta.adSoyad,
          hastaTelefon: hasta.telefon,
          terapistId: terapist_id,
          odaId: oda_id,
          cihazId: cihazIdDegeri,
          islemTanimiId: islem_tanimi_id,
          haftaninGunu: g.gun,
          saat: g.saat,
          sureDakika: sure_dakika,
          baslangicBilesen: bugun,
          bitisBilesen,
          userId: y.userId,
          uygunluk,
        });
        toplamBasariliTarihler.push(...basariliTarihler);
        toplamCakismalar.push(...cakismalar);
      }

      if (eklenemeyenGunler.length === gunler.length) throw new Error("hicbir_gun_olusturulamadi");
      return { toplamBasariliTarihler, toplamCakismalar, eklenemeyenGunler };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Periyodik randevu oluşturulamadı." };

    revalidatePath("/panel/randevular");
    revalidatePath("/panel");
    revalidateHastaDetay(hasta_id);

    const parcalar = [`${sonuc.toplamBasariliTarihler.length} randevu eklendi`];
    if (sonuc.toplamCakismalar.length > 0) {
      parcalar.push(`${sonuc.toplamCakismalar.length} tarihte çakışma var (aşağıdaki WhatsApp linkleriyle saat değişikliği isteyebilirsiniz)`);
    }
    if (sonuc.eklenemeyenGunler.length > 0) {
      parcalar.push(`${sonuc.eklenemeyenGunler.join(", ")} günü/günleri oluşturulamadı`);
    }
    const mesaj = `Periyodik randevu oluşturuldu (${bitisTarihiStr} tarihine kadar): ${parcalar.join(", ")}.`;

    return {
      success: true,
      message: mesaj,
      cakismalar: sonuc.toplamCakismalar.length > 0 ? sonuc.toplamCakismalar : undefined,
    };
  } catch (e) {
    console.error("Periyodik randevu oluşturulamadı:", pgHata(e).mesaj);
    return { success: false, message: "Periyodik randevu oluşturulamadı, lütfen tekrar deneyin." };
  }
}

export async function periyodikRandevuIptalEt(periyodikId: string, hastaId: string): Promise<SonucDurumu> {
  const y = await yetkiAl(YONETIM_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  try {
    const sonuc = await withTenant(y.bag, async (tx) => {
      const guncellenen = await tx.update(sema.periyodikRandevu).set({ durum: "iptal" }).where(eq(sema.periyodikRandevu.id, periyodikId)).returning({ id: sema.periyodikRandevu.id });
      if (guncellenen.length === 0) return { hata: "Periyodik randevu bulunamadı." };
      // Henüz gelmemiş (planlandi) ve gelecekteki seri randevuları da iptal edilir.
      await tx
        .update(sema.randevu)
        .set({ durum: "iptal" })
        .where(and(eq(sema.randevu.periyodikRandevuId, periyodikId), eq(sema.randevu.durum, "planlandi"), gte(sema.randevu.baslangic, new Date().toISOString())));
      return { tamam: true as const };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "İptal edilemedi." };
  } catch (e) {
    console.error("Periyodik randevu iptal edilemedi:", pgHata(e).mesaj);
    return { success: false, message: "İptal edilemedi, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { success: true, message: "Periyodik randevu iptal edildi, henüz gelmemiş randevular da iptal edildi." };
}

/**
 * Periyodik randevuyu düzenler: gün/saat değiştirilebilir (bu turdan
 * itibaren gelecekteki henüz gelmemiş randevular yeni takvime göre yeniden
 * üretilir, geçmiş/geçmiş olmuş randevulara dokunulmaz) ve/veya "uzat"
 * işaretlenirse süre mevcut bitiş tarihinden (veya bugünden, hangisi
 * ileriyse) itibaren PERIYODIK_SURE_AY (5 ay) uzatılır.
 */
export async function periyodikRandevuGuncelle(
  periyodikId: string,
  hastaId: string,
  _onceki: PeriyodikSonucu,
  formData: FormData
): Promise<PeriyodikSonucu> {
  const y = await yetkiAl(YONETIM_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = periyodikGuncelleSemasi.safeParse({
    haftanin_gunu: formData.get("haftanin_gunu"),
    saat: formData.get("saat"),
    uzat: formData.get("uzat") ?? "",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { haftanin_gunu, saat, uzat } = ayristirma.data;
  const uzatilacakMi = uzat === "on";

  try {
    const sonuc = await withTenant(y.bag, async (tx) => {
      const periyodik = (
        await tx
          .select({
            hastaId: sema.periyodikRandevu.hastaId,
            terapistId: sema.periyodikRandevu.terapistId,
            odaId: sema.periyodikRandevu.odaId,
            cihazId: sema.periyodikRandevu.cihazId,
            islemTanimiId: sema.periyodikRandevu.islemTanimiId,
            haftaninGunu: sema.periyodikRandevu.haftaninGunu,
            saat: sema.periyodikRandevu.saat,
            sureDakika: sema.periyodikRandevu.sureDakika,
            bitisTarihi: sema.periyodikRandevu.bitisTarihi,
            durum: sema.periyodikRandevu.durum,
          })
          .from(sema.periyodikRandevu)
          .where(eq(sema.periyodikRandevu.id, periyodikId))
          .limit(1)
      )[0];

      if (!periyodik || periyodik.durum !== "aktif") return { hata: "Periyodik randevu bulunamadı." };

      const hasta = (await tx.select({ adSoyad: sema.hasta.adSoyad, telefon: sema.hasta.telefon }).from(sema.hasta).where(eq(sema.hasta.id, periyodik.hastaId)).limit(1))[0];
      if (!hasta) return { hata: "Hasta bulunamadı." };

      const bugun = istanbulTarihBilesenleri(new Date());
      const mevcutBitis = periyodik.bitisTarihi ? tarihStrAyristir(periyodik.bitisTarihi) : bugun;
      const takvimDegisti = haftanin_gunu !== periyodik.haftaninGunu || saat !== periyodik.saat.slice(0, 5);

      const uzatmaBaslangici = enSonBilesen(mevcutBitis, bugun);
      const yeniBitis = uzatilacakMi ? ayEkle(uzatmaBaslangici, PERIYODIK_SURE_AY) : mevcutBitis;
      const yeniBitisStr = tarihStr(yeniBitis.yil, yeniBitis.ay, yeniBitis.gun);

      if (takvimDegisti) {
        await tx
          .update(sema.randevu)
          .set({ durum: "iptal" })
          .where(and(eq(sema.randevu.periyodikRandevuId, periyodikId), eq(sema.randevu.durum, "planlandi"), gte(sema.randevu.baslangic, new Date().toISOString())));
      }

      await tx
        .update(sema.periyodikRandevu)
        .set({ haftaninGunu: haftanin_gunu, saat, bitisTarihi: yeniBitisStr, otomatikYenile: true })
        .where(eq(sema.periyodikRandevu.id, periyodikId));

      const uretimBaslangici = takvimDegisti ? bugun : uzatilacakMi ? gunEkle(mevcutBitis, 1) : null;

      let basariliTarihler: string[] = [];
      let cakismalar: { tarihEtiketi: string; whatsappLink: string }[] = [];

      if (uretimBaslangici && bilesenKarsilastir(uretimBaslangici, yeniBitis) <= 0) {
        const uygunluk = await terapistUygunlukGetir(tx, periyodik.terapistId, tarihStr(uretimBaslangici.yil, uretimBaslangici.ay, uretimBaslangici.gun), yeniBitisStr);
        const uretim = await periyodikSatirlariUret({
          tx,
          klinikId: y.klinikId,
          periyodikId,
          hastaId: periyodik.hastaId,
          hastaAdSoyad: hasta.adSoyad,
          hastaTelefon: hasta.telefon,
          terapistId: periyodik.terapistId,
          odaId: periyodik.odaId,
          cihazId: periyodik.cihazId,
          islemTanimiId: periyodik.islemTanimiId,
          haftaninGunu: haftanin_gunu,
          saat,
          sureDakika: periyodik.sureDakika,
          baslangicBilesen: uretimBaslangici,
          bitisBilesen: yeniBitis,
          userId: y.userId,
          uygunluk,
        });
        basariliTarihler = uretim.basariliTarihler;
        cakismalar = uretim.cakismalar;
      }

      return { takvimDegisti, yeniBitisStr, basariliTarihler, cakismalar };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Güncellenemedi." };

    revalidateHastaDetay(hastaId);
    revalidatePath("/panel/randevular");
    revalidatePath("/panel");

    const parcalar: string[] = [];
    if (sonuc.takvimDegisti) parcalar.push("takvim güncellendi");
    if (uzatilacakMi) parcalar.push(`süre ${sonuc.yeniBitisStr} tarihine uzatıldı`);
    if (sonuc.basariliTarihler.length > 0) parcalar.push(`${sonuc.basariliTarihler.length} yeni randevu eklendi`);
    const mesaj =
      parcalar.length > 0 ? `Periyodik randevu güncellendi: ${parcalar.join(", ")}.` : "Periyodik randevu güncellendi.";

    return {
      success: true,
      message: mesaj,
      cakismalar: sonuc.cakismalar.length > 0 ? sonuc.cakismalar : undefined,
    };
  } catch (e) {
    console.error("Periyodik randevu güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }
}

export async function periyodikRandevuYenilenmeyecek(periyodikId: string, hastaId: string): Promise<SonucDurumu> {
  const y = await yetkiAl(YONETIM_ROLLERI);
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  try {
    const guncellenen = await withTenant(y.bag, (tx) =>
      tx.update(sema.periyodikRandevu).set({ otomatikYenile: false }).where(eq(sema.periyodikRandevu.id, periyodikId)).returning({ id: sema.periyodikRandevu.id })
    );
    if (guncellenen.length === 0) return { success: false, message: "Periyodik randevu bulunamadı." };
  } catch (e) {
    console.error("Periyodik randevu 'yenilenmeyecek' işaretlenemedi:", pgHata(e).mesaj);
    return { success: false, message: "İşlem başarısız, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Periyodik randevu, bitiş tarihinde yenilenmeyecek şekilde işaretlendi." };
}

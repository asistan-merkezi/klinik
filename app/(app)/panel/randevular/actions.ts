"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toUTC } from "@/lib/datetime";
import { whatsappLinkOlustur } from "@/lib/utils";
import type { RandevuDurum } from "@/types/randevu";
import { GUN_ETIKETI, type HaftaninGunu } from "@/types/periyodik-randevu";
import { revalidateHastaDetay } from "../hastalar/[id]/revalidate";

type SonucDurumu = { success: boolean; message: string } | null;

const randevuSemasi = z.object({
  hasta_id: z.string().uuid("Hasta seçilmeli."),
  terapist_id: z.string().uuid("Terapist seçilmeli."),
  oda_id: z.string().uuid("Oda seçilmeli."),
  islem_tanimi_id: z.string().uuid("Tedavi seçilmeli."),
  cihaz_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  tarih: z.string().min(1, "Tarih gerekli."),
  saat: z.string().min(1, "Saat gerekli."),
  sure_dakika: z.coerce.number().int().min(5, "Süre en az 5 dakika olmalı.").max(480, "Süre en fazla 480 dakika olabilir."),
  /** Doluysa (Bekleyen Randevu Talepleri'nden açılan formda) randevu başarıyla
   *  oluşunca ilgili randevu_talebi satırı da onaylanmış olarak işaretlenir. */
  talep_id: z.union([z.string().uuid(), z.literal("")]).optional(),
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id")
    .eq("id", user.id)
    .single();

  if (!kullanici?.klinik_id) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

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
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { hasta_id, terapist_id, oda_id, islem_tanimi_id, cihaz_id, tarih, saat, sure_dakika, talep_id } =
    ayristirma.data;

  let baslangicIso: string;
  try {
    baslangicIso = toUTC(`${tarih}T${saat}:00`);
  } catch {
    return { success: false, message: "Tarih/saat geçersiz." };
  }
  const bitisIso = new Date(new Date(baslangicIso).getTime() + sure_dakika * 60_000).toISOString();

  const { data: yeniRandevu, error } = await supabase
    .from("randevu")
    .insert({
      klinik_id: kullanici.klinik_id,
      hasta_id,
      terapist_id,
      oda_id,
      islem_tanimi_id,
      cihaz_id: cihaz_id ? cihaz_id : null,
      baslangic: baslangicIso,
      bitis: bitisIso,
      olusturan_kullanici_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Randevu oluşturulamadı:", error);
    if (error.code === "23P01") {
      return {
        success: false,
        message: "Seçilen terapist, oda veya cihaz bu saatte dolu.",
      };
    }
    return { success: false, message: "Randevu oluşturulamadı, lütfen tekrar deneyin." };
  }

  if (talep_id) {
    const { error: talepHata } = await supabase
      .from("randevu_talebi")
      .update({
        durum: "onaylandi",
        olusturulan_randevu_id: yeniRandevu.id,
        yanit_kullanici_id: user.id,
        yanit_tarihi: new Date().toISOString(),
      })
      .eq("id", talep_id);
    if (talepHata) {
      console.error("Randevu talebi güncellenemedi (randevu yine de oluşturuldu):", talepHata);
    }
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  revalidateHastaDetay(hasta_id);
  return { success: true, message: "Randevu oluşturuldu." };
}

/** Bekleyen Randevu Talepleri kartındaki "Reddet" — iptalTalebiReddet ile aynı iskelet. */
export async function randevuTalebiReddet(talepId: string): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { error } = await supabase
    .from("randevu_talebi")
    .update({ durum: "reddedildi", yanit_kullanici_id: user.id, yanit_tarihi: new Date().toISOString() })
    .eq("id", talepId);

  if (error) {
    console.error("Randevu talebi reddedilemedi:", error);
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

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

  const { error } = await supabase
    .from("randevu")
    .update({
      hasta_id,
      terapist_id,
      oda_id,
      islem_tanimi_id,
      cihaz_id: cihaz_id ? cihaz_id : null,
      baslangic: baslangicIso,
      bitis: bitisIso,
      tani: tani ? tani : null,
      antrenor_id: antrenor_id ? antrenor_id : null,
      tedavi_protokolu_id: tedavi_protokolu_id ? tedavi_protokolu_id : null,
    })
    .eq("id", randevuId);

  if (error) {
    console.error("Randevu güncellenemedi:", error);
    if (error.code === "23P01") {
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
 * güncellemesiyle birlikte atomik olarak randevunun işlem_tanimi'ne göre ya
 * aktif paketten 1 hak düşer ya da hasta_bakiye_hareket'e 'borc' satırı
 * eklenir (bkz. migration 20260731110000/20260731130000, kullanıcı kararı —
 * CLAUDE.md). gecikmeDakika verilirse durum 'gecikmeli_geldi' olur, ikisi de
 * aynı paket/borç mantığını çalıştırır. Randevu Detay panelindeki 5 sonuç
 * seçeneği (Geldi/Gecikmeli Geldi/Gelmedi/Ertelendi/İptal) her zaman
 * tıklanabilir olduğu için (kullanıcı kararı) RPC içinde idempotency kontrolü
 * var — bu fonksiyon aynı randevu için birden çok kez çağrılsa bile paket/
 * borç mantığı sadece ilk seferde işler.
 */
export async function randevuGelisIsaretle(
  randevuId: string,
  gecikmeDakika: number | null
): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data, error } = await supabase.rpc("randevu_gelis_isaretle", {
    p_randevu_id: randevuId,
    p_gecikme_dakika: gecikmeDakika,
  });

  if (error) {
    console.error("Randevu geliş işaretlenemedi:", error);
    if (error.code === "23P01") {
      return { success: false, message: "Bu randevu için oda/terapist/cihaz bu saatte dolu." };
    }
    return { success: false, message: "Geliş işaretlenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");

  const sonuc = data as { yontem?: string; hasta_id?: string; tutar?: number; kalan_adet?: number } | null;
  if (sonuc?.hasta_id) {
    revalidateHastaDetay(sonuc.hasta_id);
  }

  const gelisEtiketi = gecikmeDakika ? "Gecikmeli geliş" : "Geliş";
  const mesaj =
    sonuc?.yontem === "paket"
      ? `${gelisEtiketi} işaretlendi, paketten 1 hak düşüldü (kalan: ${sonuc.kalan_adet}).`
      : sonuc?.yontem === "borc"
        ? `${gelisEtiketi} işaretlendi, ${sonuc.tutar?.toLocaleString("tr-TR", {
            style: "currency",
            currency: "TRY",
          })} bakiyeye borç olarak eklendi.`
        : sonuc?.yontem === "zaten_islendi"
          ? "Durum güncellendi (bakiye/paket bu randevu için zaten işlenmişti, tekrar işlenmedi)."
          : `${gelisEtiketi} işaretlendi.`;

  return { success: true, message: mesaj };
}

const durumSemasi = z.enum(["gelmedi", "iptal"]);

/** "Gelmedi" / "İptal" — düz durum güncellemesi (paket/bakiyeye dokunmaz). */
export async function randevuDurumGuncelle(
  randevuId: string,
  yeniDurum: Extract<RandevuDurum, "gelmedi" | "iptal">
): Promise<SonucDurumu> {
  const gecerliDurum = durumSemasi.safeParse(yeniDurum);
  if (!gecerliDurum.success) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { error } = await supabase
    .from("randevu")
    .update({ durum: gecerliDurum.data })
    .eq("id", randevuId);

  if (error) {
    console.error("Randevu durumu güncellenemedi:", error);
    return { success: false, message: "Randevu durumu güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { success: true, message: "Randevu durumu güncellendi." };
}

const ertelemeSemasi = z.object({
  tarih: z.string().min(1, "Tarih gerekli."),
  saat: z.string().min(1, "Saat gerekli."),
});

/**
 * "Ertelendi" — girilen yeni tarih/saat DOĞRUDAN randevunun baslangic/
 * bitis'ine işlenir (aynı süre korunarak), durum 'ertelendi' olur. Ayrı bir
 * randevu OLUŞTURULMAZ, aynı satır yeni zamana taşınır (kullanıcı kararı) —
 * bu yüzden oda/terapist/cihaz çakışma kontrolü yeni zaman için normal
 * şekilde yeniden çalışır (23P01).
 */
export async function randevuErtele(randevuId: string, formData: FormData): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const ayristirma = ertelemeSemasi.safeParse({
    tarih: formData.get("tarih"),
    saat: formData.get("saat"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { data: mevcut } = await supabase
    .from("randevu")
    .select("baslangic, bitis, hasta_id")
    .eq("id", randevuId)
    .single();

  if (!mevcut) {
    return { success: false, message: "Randevu bulunamadı." };
  }

  const sureMs = new Date(mevcut.bitis).getTime() - new Date(mevcut.baslangic).getTime();

  let yeniBaslangicIso: string;
  try {
    yeniBaslangicIso = toUTC(`${ayristirma.data.tarih}T${ayristirma.data.saat}:00`);
  } catch {
    return { success: false, message: "Tarih/saat geçersiz." };
  }
  const yeniBitisIso = new Date(new Date(yeniBaslangicIso).getTime() + sureMs).toISOString();

  const { error } = await supabase
    .from("randevu")
    .update({ baslangic: yeniBaslangicIso, bitis: yeniBitisIso, durum: "ertelendi" })
    .eq("id", randevuId);

  if (error) {
    console.error("Randevu ertelenemedi:", error);
    if (error.code === "23P01") {
      return { success: false, message: "Seçilen yeni saatte terapist, oda veya cihaz dolu." };
    }
    return { success: false, message: "Randevu ertelenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  if (mevcut.hasta_id) {
    revalidateHastaDetay(mevcut.hasta_id);
  }
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
 * auth.uid()'sine göre) kaydeder. Hasta Detay > Seans Geçmişi'ndeki mevcut
 * "Seansı Tamamla" formu (useSeansTamamla) ve Randevu Detay Paneli'ndeki
 * "Seansı Bitir" butonu artık İKİSİ DE bu tek fonksiyonu çağırıyor — hangi
 * yoldan tetiklenirse tetiklensin oda tabletindeki realtime abonelik aynı
 * 'tamamlandi' durumunu görüp seans sonu anket QR'ını gösteriyor.
 */
export async function randevuSeansiTamamla(randevuId: string, aciklama: string): Promise<SonucDurumu> {
  const ayristirma = seansTamamlaSemasi.safeParse({ aciklama });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Açıklama gerekli." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data, error } = await supabase
    .from("randevu")
    .update({
      durum: "tamamlandi",
      tamamlanma_aciklamasi: ayristirma.data.aciklama,
      tamamlayan_kullanici_id: user.id,
      tamamlanma_tarihi: new Date().toISOString(),
    })
    .eq("id", randevuId)
    .select("hasta_id")
    .single();

  if (error) {
    console.error("Seans tamamlanamadı:", error);
    return { success: false, message: "Seans tamamlanamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  if (data?.hasta_id) {
    revalidateHastaDetay(data.hasta_id);
  }

  return { success: true, message: "Seans tamamlandı." };
}

type SonucDurumu2 = { success: boolean; message: string } | null;

export async function iptalTalebiOnayla(talepId: string, randevuId: string): Promise<SonucDurumu2> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const [randevuSonucu, talepSonucu] = await Promise.all([
    supabase.from("randevu").update({ durum: "iptal" }).eq("id", randevuId),
    supabase
      .from("randevu_iptal_talebi")
      .update({ durum: "onaylandi", yanit_kullanici_id: user.id, yanit_tarihi: new Date().toISOString() })
      .eq("id", talepId),
  ]);

  if (randevuSonucu.error || talepSonucu.error) {
    console.error("İptal talebi onaylanamadı:", randevuSonucu.error, talepSonucu.error);
    return { success: false, message: "İptal talebi onaylanamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  return { success: true, message: "Randevu iptal edildi." };
}

export async function iptalTalebiReddet(talepId: string): Promise<SonucDurumu2> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { error } = await supabase
    .from("randevu_iptal_talebi")
    .update({ durum: "reddedildi", yanit_kullanici_id: user.id, yanit_tarihi: new Date().toISOString() })
    .eq("id", talepId);

  if (error) {
    console.error("İptal talebi reddedilemedi:", error);
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

type SupabaseSunucu = Awaited<ReturnType<typeof createClient>>;

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
  supabase: SupabaseSunucu;
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
}) {
  const {
    supabase,
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

    const bitisIso = new Date(new Date(baslangicIso).getTime() + sureDakika * 60_000).toISOString();

    const { error: randevuHata } = await supabase.from("randevu").insert({
      klinik_id: klinikId,
      hasta_id: hastaId,
      terapist_id: terapistId,
      oda_id: odaId,
      cihaz_id: cihazId,
      islem_tanimi_id: islemTanimiId,
      periyodik_randevu_id: periyodikId,
      baslangic: baslangicIso,
      bitis: bitisIso,
      olusturan_kullanici_id: userId,
    });

    const tarihEtiketi = new Date(baslangicIso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Istanbul",
    });

    if (randevuHata) {
      if (randevuHata.code === "23P01") {
        const mesaj = `Merhaba ${hastaAdSoyad}, ${tarihEtiketi} için planladığımız periyodik randevunuzda o saatte oda/terapist uygun değil. Sizinle birlikte bu hafta için alternatif bir saat belirleyebilir miyiz?`;
        cakismalar.push({ tarihEtiketi, whatsappLink: whatsappLinkOlustur(hastaTelefon, mesaj) });
        continue;
      }
      console.error("Periyodik randevu satırı oluşturulamadı:", randevuHata);
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id")
    .eq("id", user.id)
    .single();

  if (!kullanici?.klinik_id) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }

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

  const { data: hasta } = await supabase
    .from("hasta")
    .select("ad_soyad, telefon")
    .eq("id", hasta_id)
    .single();

  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const bugun = istanbulTarihBilesenleri(new Date());
  const bitisBilesen = ayEkle(bugun, PERIYODIK_SURE_AY);
  const bitisTarihiStr = tarihStr(bitisBilesen.yil, bitisBilesen.ay, bitisBilesen.gun);
  const cihazIdDegeri = cihaz_id ? cihaz_id : null;

  // Haftada birden fazla gün seçilmişse (kullanıcı kararı) her gün/saat
  // çifti için ayrı bir periyodik_randevu serisi açılır — Hasta Detay'da
  // ayrı ayrı listelenip düzenlenebilir/iptal edilebilir olsun diye.
  const toplamBasariliTarihler: string[] = [];
  const toplamCakismalar: { tarihEtiketi: string; whatsappLink: string }[] = [];
  const eklenemeyenGunler: string[] = [];

  for (const g of gunler) {
    const { data: periyodik, error: periyodikHata } = await supabase
      .from("periyodik_randevu")
      .insert({
        klinik_id: kullanici.klinik_id,
        hasta_id,
        terapist_id,
        oda_id,
        cihaz_id: cihazIdDegeri,
        islem_tanimi_id,
        haftanin_gunu: g.gun,
        saat: g.saat,
        sure_dakika,
        bitis_tarihi: bitisTarihiStr,
        olusturan_kullanici_id: user.id,
      })
      .select("id")
      .single();

    if (periyodikHata || !periyodik) {
      console.error("Periyodik randevu günü oluşturulamadı:", periyodikHata);
      eklenemeyenGunler.push(GUN_ETIKETI[g.gun as HaftaninGunu]);
      continue;
    }

    const { basariliTarihler, cakismalar } = await periyodikSatirlariUret({
      supabase,
      klinikId: kullanici.klinik_id,
      periyodikId: periyodik.id,
      hastaId: hasta_id,
      hastaAdSoyad: hasta.ad_soyad,
      hastaTelefon: hasta.telefon,
      terapistId: terapist_id,
      odaId: oda_id,
      cihazId: cihazIdDegeri,
      islemTanimiId: islem_tanimi_id,
      haftaninGunu: g.gun,
      saat: g.saat,
      sureDakika: sure_dakika,
      baslangicBilesen: bugun,
      bitisBilesen: bitisBilesen,
      userId: user.id,
    });
    toplamBasariliTarihler.push(...basariliTarihler);
    toplamCakismalar.push(...cakismalar);
  }

  if (eklenemeyenGunler.length === gunler.length) {
    return { success: false, message: "Periyodik randevu oluşturulamadı, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
  revalidateHastaDetay(hasta_id);

  const parcalar = [`${toplamBasariliTarihler.length} randevu eklendi`];
  if (toplamCakismalar.length > 0) {
    parcalar.push(`${toplamCakismalar.length} tarihte çakışma var (aşağıdaki WhatsApp linkleriyle saat değişikliği isteyebilirsiniz)`);
  }
  if (eklenemeyenGunler.length > 0) {
    parcalar.push(`${eklenemeyenGunler.join(", ")} günü/günleri oluşturulamadı`);
  }
  const mesaj = `Periyodik randevu oluşturuldu (${bitisTarihiStr} tarihine kadar): ${parcalar.join(", ")}.`;

  return {
    success: true,
    message: mesaj,
    cakismalar: toplamCakismalar.length > 0 ? toplamCakismalar : undefined,
  };
}

export async function periyodikRandevuIptalEt(periyodikId: string, hastaId: string): Promise<SonucDurumu> {
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
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error: periyodikHata } = await supabase
    .from("periyodik_randevu")
    .update({ durum: "iptal" })
    .eq("id", periyodikId);

  if (periyodikHata) {
    console.error("Periyodik randevu iptal edilemedi:", periyodikHata);
    return { success: false, message: "İptal edilemedi, lütfen tekrar deneyin." };
  }

  const { error: randevuHata } = await supabase
    .from("randevu")
    .update({ durum: "iptal" })
    .eq("periyodik_randevu_id", periyodikId)
    .eq("durum", "planlandi")
    .gte("baslangic", new Date().toISOString());

  if (randevuHata) {
    console.error("Periyodik seriye bağlı gelecek randevular iptal edilemedi:", randevuHata);
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

  if (!kullanici?.klinik_id) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (kullanici.rol !== "klinik_admin" && kullanici.rol !== "resepsiyon") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

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

  const { data: periyodik } = await supabase
    .from("periyodik_randevu")
    .select(
      "id, hasta_id, terapist_id, oda_id, cihaz_id, islem_tanimi_id, haftanin_gunu, saat, sure_dakika, bitis_tarihi, durum"
    )
    .eq("id", periyodikId)
    .single();

  if (!periyodik || periyodik.durum !== "aktif") {
    return { success: false, message: "Periyodik randevu bulunamadı." };
  }

  const { data: hasta } = await supabase
    .from("hasta")
    .select("ad_soyad, telefon")
    .eq("id", periyodik.hasta_id)
    .single();

  if (!hasta) {
    return { success: false, message: "Hasta bulunamadı." };
  }

  const bugun = istanbulTarihBilesenleri(new Date());
  const mevcutBitis = periyodik.bitis_tarihi ? tarihStrAyristir(periyodik.bitis_tarihi) : bugun;
  const takvimDegisti = haftanin_gunu !== periyodik.haftanin_gunu || saat !== periyodik.saat.slice(0, 5);

  const uzatmaBaslangici = enSonBilesen(mevcutBitis, bugun);
  const yeniBitis = uzatilacakMi ? ayEkle(uzatmaBaslangici, PERIYODIK_SURE_AY) : mevcutBitis;
  const yeniBitisStr = tarihStr(yeniBitis.yil, yeniBitis.ay, yeniBitis.gun);

  if (takvimDegisti) {
    await supabase
      .from("randevu")
      .update({ durum: "iptal" })
      .eq("periyodik_randevu_id", periyodikId)
      .eq("durum", "planlandi")
      .gte("baslangic", new Date().toISOString());
  }

  const { error: guncelleHata } = await supabase
    .from("periyodik_randevu")
    .update({
      haftanin_gunu,
      saat,
      bitis_tarihi: yeniBitisStr,
      otomatik_yenile: true,
    })
    .eq("id", periyodikId);

  if (guncelleHata) {
    console.error("Periyodik randevu güncellenemedi:", guncelleHata);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  const uretimBaslangici = takvimDegisti ? bugun : uzatilacakMi ? gunEkle(mevcutBitis, 1) : null;

  let basariliTarihler: string[] = [];
  let cakismalar: { tarihEtiketi: string; whatsappLink: string }[] = [];

  if (uretimBaslangici && bilesenKarsilastir(uretimBaslangici, yeniBitis) <= 0) {
    const sonuc = await periyodikSatirlariUret({
      supabase,
      klinikId: kullanici.klinik_id,
      periyodikId,
      hastaId: periyodik.hasta_id,
      hastaAdSoyad: hasta.ad_soyad,
      hastaTelefon: hasta.telefon,
      terapistId: periyodik.terapist_id,
      odaId: periyodik.oda_id,
      cihazId: periyodik.cihaz_id,
      islemTanimiId: periyodik.islem_tanimi_id,
      haftaninGunu: haftanin_gunu,
      saat,
      sureDakika: periyodik.sure_dakika,
      baslangicBilesen: uretimBaslangici,
      bitisBilesen: yeniBitis,
      userId: user.id,
    });
    basariliTarihler = sonuc.basariliTarihler;
    cakismalar = sonuc.cakismalar;
  }

  revalidateHastaDetay(hastaId);
  revalidatePath("/panel/randevular");
  revalidatePath("/panel");

  const parcalar: string[] = [];
  if (takvimDegisti) parcalar.push("takvim güncellendi");
  if (uzatilacakMi) parcalar.push(`süre ${yeniBitisStr} tarihine uzatıldı`);
  if (basariliTarihler.length > 0) parcalar.push(`${basariliTarihler.length} yeni randevu eklendi`);
  const mesaj =
    parcalar.length > 0 ? `Periyodik randevu güncellendi: ${parcalar.join(", ")}.` : "Periyodik randevu güncellendi.";

  return {
    success: true,
    message: mesaj,
    cakismalar: cakismalar.length > 0 ? cakismalar : undefined,
  };
}

export async function periyodikRandevuYenilenmeyecek(periyodikId: string, hastaId: string): Promise<SonucDurumu> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();
  if (kullanici?.rol !== "klinik_admin" && kullanici?.rol !== "resepsiyon") {
    return { success: false, message: "Bu işlem için yetkiniz yok." };
  }

  const { error } = await supabase
    .from("periyodik_randevu")
    .update({ otomatik_yenile: false })
    .eq("id", periyodikId);

  if (error) {
    console.error("Periyodik randevu 'yenilenmeyecek' işaretlenemedi:", error);
    return { success: false, message: "İşlem başarısız, lütfen tekrar deneyin." };
  }

  revalidateHastaDetay(hastaId);
  return { success: true, message: "Periyodik randevu, bitiş tarihinde yenilenmeyecek şekilde işaretlendi." };
}

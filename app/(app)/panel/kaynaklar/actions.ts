"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eylemYetkisiGetir, YETKISIZ_MESAJI } from "@/lib/auth/eylem-yetkisi";
import { isimBasHarfBuyukYap } from "@/lib/utils";

type SonucDurumu = { success: boolean; message: string } | null;

const tabloSemasi = z.enum(["oda", "cihaz"]);
export type KaynakTablosu = z.infer<typeof tabloSemasi>;

const ETIKET: Record<KaynakTablosu, string> = {
  oda: "Oda",
  cihaz: "Cihaz",
};

async function klinikIdGetir() {
  return eylemYetkisiGetir(["klinik_admin", "resepsiyon"]);
}

export async function kaynakOlustur(
  tablo: KaynakTablosu,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const gecerliTablo = tabloSemasi.safeParse(tablo);
  if (!gecerliTablo.success) {
    return { success: false, message: "Geçersiz kaynak türü." };
  }

  const { supabase, klinikId, yetkili } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (!yetkili) {
    return { success: false, message: YETKISIZ_MESAJI };
  }

  const adSemasi = z.string().trim().min(2, "Ad en az 2 karakter olmalı.");
  const ayristirma = adSemasi.safeParse(formData.get("ad"));
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const kayit: { klinik_id: string; ad: string; adet?: number; kapasite?: number } = {
    klinik_id: klinikId,
    ad: isimBasHarfBuyukYap(ayristirma.data),
  };

  if (gecerliTablo.data === "cihaz") {
    const adetSemasi = z.coerce.number().int().min(1, "Adet en az 1 olmalı.");
    const adetAyristirma = adetSemasi.safeParse(formData.get("adet") || 1);
    if (!adetAyristirma.success) {
      return { success: false, message: adetAyristirma.error.issues[0]?.message ?? "Girdi hatalı." };
    }
    kayit.adet = adetAyristirma.data;
  }

  if (gecerliTablo.data === "oda") {
    const kapasiteSemasi = z.coerce.number().int().min(1, "Kapasite en az 1 olmalı.");
    const kapasiteAyristirma = kapasiteSemasi.safeParse(formData.get("kapasite") || 1);
    if (!kapasiteAyristirma.success) {
      return { success: false, message: kapasiteAyristirma.error.issues[0]?.message ?? "Girdi hatalı." };
    }
    kayit.kapasite = kapasiteAyristirma.data;
  }

  const { error } = await supabase.from(gecerliTablo.data).insert(kayit);

  if (error) {
    console.error(`${gecerliTablo.data} oluşturulamadı:`, error);
    return { success: false, message: `${ETIKET[gecerliTablo.data]} eklenemedi, lütfen tekrar deneyin.` };
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
  return { success: true, message: `${ETIKET[gecerliTablo.data]} eklendi.` };
}

export async function kaynakAdGuncelle(
  tablo: KaynakTablosu,
  kaynakId: string,
  yeniAd: string
): Promise<SonucDurumu> {
  const gecerliTablo = tabloSemasi.safeParse(tablo);
  if (!gecerliTablo.success) {
    return { success: false, message: "Geçersiz kaynak türü." };
  }

  const { supabase, klinikId, yetkili } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (!yetkili) {
    return { success: false, message: YETKISIZ_MESAJI };
  }

  const adSemasi = z.string().trim().min(2, "Ad en az 2 karakter olmalı.");
  const ayristirma = adSemasi.safeParse(yeniAd);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { error } = await supabase
    .from(gecerliTablo.data)
    .update({ ad: isimBasHarfBuyukYap(ayristirma.data) })
    .eq("id", kaynakId);

  if (error) {
    console.error(`${gecerliTablo.data} adı güncellenemedi:`, error);
    return { success: false, message: `${ETIKET[gecerliTablo.data]} adı güncellenemedi, lütfen tekrar deneyin.` };
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
  return { success: true, message: `${ETIKET[gecerliTablo.data]} adı güncellendi.` };
}

export async function kaynakAdetGuncelle(kaynakId: string, yeniAdet: number) {
  const { supabase, klinikId, yetkili } = await klinikIdGetir();
  if (!klinikId || !yetkili) {
    return;
  }

  const adetSemasi = z.coerce.number().int().min(1);
  const ayristirma = adetSemasi.safeParse(yeniAdet);
  if (!ayristirma.success) {
    return;
  }

  const { error } = await supabase.from("cihaz").update({ adet: ayristirma.data }).eq("id", kaynakId);

  if (error) {
    console.error("Cihaz adedi güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
}

export async function kaynakKapasiteGuncelle(kaynakId: string, yeniKapasite: number) {
  const { supabase, klinikId, yetkili } = await klinikIdGetir();
  if (!klinikId || !yetkili) {
    return;
  }

  const kapasiteSemasi = z.coerce.number().int().min(1);
  const ayristirma = kapasiteSemasi.safeParse(yeniKapasite);
  if (!ayristirma.success) {
    return;
  }

  const { error } = await supabase.from("oda").update({ kapasite: ayristirma.data }).eq("id", kaynakId);

  if (error) {
    console.error("Oda kapasitesi güncellenemedi:", error);
    return;
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
}

export async function kaynakAktifDurumDegistir(
  tablo: KaynakTablosu,
  kaynakId: string,
  yeniDurum: boolean
): Promise<{ success: boolean; message: string } | null> {
  const gecerliTablo = tabloSemasi.safeParse(tablo);
  if (!gecerliTablo.success) {
    return null;
  }

  const { supabase, klinikId, yetkili } = await klinikIdGetir();
  if (!klinikId) {
    return { success: false, message: "Klinik bilgisi bulunamadı." };
  }
  if (!yetkili) {
    return { success: false, message: YETKISIZ_MESAJI };
  }

  // Randevu Çizelgesi yalnız AKTİF odaları/cihazları gösterir: gelecek randevusu olan bir kaynak
  // pasife alınırsa o randevular çizelgeden kaybolur (hasta gelir, randevu görünmez).
  if (!yeniDurum) {
    const simdi = new Date().toISOString();
    const { count } =
      gecerliTablo.data === "oda"
        ? await supabase
            .from("randevu")
            .select("id", { count: "exact", head: true })
            .eq("oda_id", kaynakId)
            .in("durum", ["planlandi", "ertelendi", "geldi", "gecikmeli_geldi"])
            .gte("bitis", simdi)
        : await supabase
            .from("randevu_cihaz_rezervasyon")
            .select("id", { count: "exact", head: true })
            .eq("cihaz_id", kaynakId)
            .gte("bitis", simdi);
    if (count) {
      return {
        success: false,
        message: `Bu ${gecerliTablo.data === "oda" ? "odaya" : "cihaza"} ait ${count} gelecek randevu var; önce randevuları başka ${gecerliTablo.data === "oda" ? "odaya" : "cihaza"} aktarın ya da iptal edin.`,
      };
    }
  }

  const { error } = await supabase
    .from(gecerliTablo.data)
    .update({ aktif: yeniDurum })
    .eq("id", kaynakId);

  if (error) {
    console.error(`${gecerliTablo.data} durumu güncellenemedi:`, error);
    return { success: false, message: "Durum güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
  return null;
}

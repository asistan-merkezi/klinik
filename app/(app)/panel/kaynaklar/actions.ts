"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { isimBasHarfBuyukYap } from "@/lib/utils";

type SonucDurumu = { success: boolean; message: string } | null;

const tabloSemasi = z.enum(["oda", "cihaz"]);
export type KaynakTablosu = z.infer<typeof tabloSemasi>;

const ETIKET: Record<KaynakTablosu, string> = {
  oda: "Oda",
  cihaz: "Cihaz",
};

const UUID = z.string().uuid();

/** Rol kümesi RLS ile birebir (oda_yonet_resepsiyon_admin / cihaz_yonet_resepsiyon_admin). */
async function yetkiAl() {
  const y = await eylemYetkisi(["klinik_admin", "resepsiyon"]);
  if (!y.yetkili || !y.bag || !y.klinikId) return null;
  return { bag: y.bag, klinikId: y.klinikId };
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

  const y = await yetkiAl();
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const adSemasi = z.string().trim().min(2, "Ad en az 2 karakter olmalı.");
  const ayristirma = adSemasi.safeParse(formData.get("ad"));
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const ad = isimBasHarfBuyukYap(ayristirma.data);

  try {
    if (gecerliTablo.data === "cihaz") {
      const adetAyristirma = z.coerce.number().int().min(1, "Adet en az 1 olmalı.").safeParse(formData.get("adet") || 1);
      if (!adetAyristirma.success) {
        return { success: false, message: adetAyristirma.error.issues[0]?.message ?? "Girdi hatalı." };
      }
      await withTenant(y.bag, (tx) => tx.insert(sema.cihaz).values({ klinikId: y.klinikId, ad, adet: adetAyristirma.data }));
    } else {
      const kapasiteAyristirma = z.coerce.number().int().min(1, "Kapasite en az 1 olmalı.").safeParse(formData.get("kapasite") || 1);
      if (!kapasiteAyristirma.success) {
        return { success: false, message: kapasiteAyristirma.error.issues[0]?.message ?? "Girdi hatalı." };
      }
      await withTenant(y.bag, (tx) => tx.insert(sema.oda).values({ klinikId: y.klinikId, ad, kapasite: kapasiteAyristirma.data }));
    }
  } catch (e) {
    console.error(`${gecerliTablo.data} oluşturulamadı:`, pgHata(e).mesaj);
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
  if (!gecerliTablo.success || !UUID.safeParse(kaynakId).success) {
    return { success: false, message: "Geçersiz kaynak türü." };
  }

  const y = await yetkiAl();
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = z.string().trim().min(2, "Ad en az 2 karakter olmalı.").safeParse(yeniAd);
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const ad = isimBasHarfBuyukYap(ayristirma.data);

  try {
    const g =
      gecerliTablo.data === "oda"
        ? await withTenant(y.bag, (tx) => tx.update(sema.oda).set({ ad }).where(eq(sema.oda.id, kaynakId)).returning({ id: sema.oda.id }))
        : await withTenant(y.bag, (tx) => tx.update(sema.cihaz).set({ ad }).where(eq(sema.cihaz.id, kaynakId)).returning({ id: sema.cihaz.id }));
    if (g.length === 0) return { success: false, message: `${ETIKET[gecerliTablo.data]} bulunamadı.` };
  } catch (e) {
    console.error(`${gecerliTablo.data} adı güncellenemedi:`, pgHata(e).mesaj);
    return { success: false, message: `${ETIKET[gecerliTablo.data]} adı güncellenemedi, lütfen tekrar deneyin.` };
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
  return { success: true, message: `${ETIKET[gecerliTablo.data]} adı güncellendi.` };
}

export async function kaynakAdetGuncelle(kaynakId: string, yeniAdet: number) {
  const y = await yetkiAl();
  const ayristirma = z.coerce.number().int().min(1).safeParse(yeniAdet);
  if (!y || !ayristirma.success || !UUID.safeParse(kaynakId).success) return;

  try {
    await withTenant(y.bag, (tx) => tx.update(sema.cihaz).set({ adet: ayristirma.data }).where(eq(sema.cihaz.id, kaynakId)));
  } catch (e) {
    console.error("Cihaz adedi güncellenemedi:", pgHata(e).mesaj);
    return;
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
}

export async function kaynakKapasiteGuncelle(kaynakId: string, yeniKapasite: number) {
  const y = await yetkiAl();
  const ayristirma = z.coerce.number().int().min(1).safeParse(yeniKapasite);
  if (!y || !ayristirma.success || !UUID.safeParse(kaynakId).success) return;

  try {
    await withTenant(y.bag, (tx) => tx.update(sema.oda).set({ kapasite: ayristirma.data }).where(eq(sema.oda.id, kaynakId)));
  } catch (e) {
    console.error("Oda kapasitesi güncellenemedi:", pgHata(e).mesaj);
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
  if (!gecerliTablo.success || !UUID.safeParse(kaynakId).success) {
    return null;
  }

  const y = await yetkiAl();
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  try {
    const sonuc = await withTenant(y.bag, async (tx) => {
      // Randevu Çizelgesi yalnız AKTİF odaları/cihazları gösterir: gelecek randevusu olan bir kaynak
      // pasife alınırsa o randevular çizelgeden kaybolur (hasta gelir, randevu görünmez).
      if (!yeniDurum) {
        const simdi = new Date().toISOString();
        const [{ n }] =
          gecerliTablo.data === "oda"
            ? await tx
                .select({ n: count() })
                .from(sema.randevu)
                .where(and(eq(sema.randevu.odaId, kaynakId), inArray(sema.randevu.durum, ["planlandi", "ertelendi", "geldi", "gecikmeli_geldi"]), gte(sema.randevu.bitis, simdi)))
            : await tx.select({ n: count() }).from(sema.randevuCihazRezervasyon).where(and(eq(sema.randevuCihazRezervasyon.cihazId, kaynakId), gte(sema.randevuCihazRezervasyon.bitis, simdi)));
        if (n) {
          const hedef = gecerliTablo.data === "oda" ? "odaya" : "cihaza";
          return { hata: `Bu ${hedef} ait ${n} gelecek randevu var; önce randevuları başka ${hedef} aktarın ya da iptal edin.` };
        }
      }
      const g =
        gecerliTablo.data === "oda"
          ? await tx.update(sema.oda).set({ aktif: yeniDurum }).where(eq(sema.oda.id, kaynakId)).returning({ id: sema.oda.id })
          : await tx.update(sema.cihaz).set({ aktif: yeniDurum }).where(eq(sema.cihaz.id, kaynakId)).returning({ id: sema.cihaz.id });
      return g.length === 0 ? { hata: "Kayıt bulunamadı." } : { tamam: true as const };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Güncellenemedi." };
  } catch (e) {
    console.error(`${gecerliTablo.data} durumu güncellenemedi:`, pgHata(e).mesaj);
    return { success: false, message: "Durum güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/kaynaklar");
  revalidatePath("/panel/randevular");
  return null;
}

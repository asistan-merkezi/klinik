"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { pgHata, rpc, sema, withTenant } from "@/lib/db";
import { eylemYetkisi } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

const SAYFA = "/panel/ayarlar/resmi-tatiller";

function sayfalariYenile() {
  revalidatePath(SAYFA);
  revalidatePath("/panel/personel/puantaj-cetveli");
}

async function yetkiliKlinikAdminGetir() {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") return { bag: null, klinikId: null };
  return { bag: y.bag, klinikId: y.klinikId };
}

const tarihSemasi = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih seçilmeli.");

const tatilEkleSemasi = z.object({
  tarih: tarihSemasi,
  ad: z.string().trim().min(2, "Tatil adı girilmeli.").max(120),
});

/** Kliniğe özel tatil (idari izin, bayram uzatması, kliniğin kapalı olduğu gün vb.). */
export async function tatilEkle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { bag, klinikId } = await yetkiliKlinikAdminGetir();
  if (!bag || !klinikId) return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = tatilEkleSemasi.safeParse({ tarih: formData.get("tarih"), ad: formData.get("ad") });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const { tarih, ad } = ayristirma.data;

  try {
    const sonuc = await withTenant(bag, async (tx) => {
      const mevcut = (await tx.select({ ad: sema.resmiTatil.ad }).from(sema.resmiTatil).where(eq(sema.resmiTatil.tarih, tarih)).limit(1))[0];
      if (mevcut) return { hata: `Bu gün zaten tatil olarak kayıtlı (${mevcut.ad}).` };
      await tx.insert(sema.resmiTatil).values({ klinikId, tarih, ad });
      return { tamam: true as const };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Tatil eklenemedi." };
  } catch (e) {
    console.error("Resmi tatil eklenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Tatil eklenemedi, lütfen tekrar deneyin." };
  }

  sayfalariYenile();
  return { success: true, message: "Tatil eklendi." };
}

/** Yalnız kliniğin kendi eklediği/onayladığı satırlar silinir; sistem (global) tatilleri RLS'le korunur. */
export async function tatilSil(id: string): Promise<SonucDurumu> {
  const { bag, klinikId } = await yetkiliKlinikAdminGetir();
  if (!bag || !klinikId) return { success: false, message: "Bu işlem için yetkiniz yok." };
  if (!z.string().uuid().safeParse(id).success) return { success: false, message: "Tatil bulunamadı." };

  try {
    const silinen = await withTenant(bag, (tx) => tx.delete(sema.resmiTatil).where(and(eq(sema.resmiTatil.id, id), eq(sema.resmiTatil.klinikId, klinikId))).returning({ id: sema.resmiTatil.id }));
    if (silinen.length === 0) return { success: false, message: "Sistem tatilleri silinemez; yalnız kliniğe özel tatiller silinebilir." };
  } catch (e) {
    console.error("Resmi tatil silinemedi:", pgHata(e).mesaj);
    return { success: false, message: "Tatil silinemedi, lütfen tekrar deneyin." };
  }

  sayfalariYenile();
  return { success: true, message: "Tatil silindi." };
}

const kararSemasi = z.object({
  yil: z.coerce.number().int().min(2000).max(2100),
  bayram: z.enum(["ramazan", "kurban"]),
  karar: z.enum(["onayla", "reddet"]),
  tarihler: z.array(tarihSemasi),
});

const KARAR_HATALARI: Record<string, string> = {
  yetkisiz: "Bu işlem için yetkiniz yok.",
  oneri_bulunamadi: "Bu öneri artık beklemede değil (sayfayı yenileyin).",
  tarihler_gecersiz: "Tarihler ardışık olmalı, öneriyle aynı gün sayısında ve aynı yıl içinde kalmalı.",
};

/** Bir bayramın önerisini (gerekirse düzeltilmiş tarihlerle) onaylar ya da reddeder. */
export async function bayramOnerisiKarar(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const { bag, klinikId } = await yetkiliKlinikAdminGetir();
  if (!bag || !klinikId) return { success: false, message: "Bu işlem için yetkiniz yok." };

  const ayristirma = kararSemasi.safeParse({
    yil: formData.get("yil"),
    bayram: formData.get("bayram"),
    karar: formData.get("karar"),
    tarihler: formData.getAll("tarih"),
  });
  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }
  const { yil, bayram, karar, tarihler } = ayristirma.data;
  const onay = karar === "onayla";

  try {
    await withTenant(bag, (tx) => rpc(tx, "resmi_tatil_onerisi_karar", { p_yil: yil, p_bayram: bayram, p_onay: onay, p_tarihler: onay ? tarihler : null }));
  } catch (e) {
    const h = pgHata(e);
    console.error("Bayram önerisi kararı kaydedilemedi:", h.mesaj);
    const anahtar = Object.keys(KARAR_HATALARI).find((k) => h.mesaj.includes(k));
    return { success: false, message: anahtar ? KARAR_HATALARI[anahtar] : "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  sayfalariYenile();
  return {
    success: true,
    message: onay
      ? "Bayram tarihleri onaylandı; izin ve puantaj hesaplarında tatil sayılacak."
      : "Öneri reddedildi. Doğru tarihleri aşağıdaki formdan elle ekleyin.",
  };
}

/**
 * Eskiden "şimdi kontrol et" servis rolüyle global tatil + klinik önerisi yazardı. Global `resmi_tatil` ve `resmi_tatil_oneri` yazımı artık YALNIZ
 * aylık bakım betiğindedir (bakim_rolu); kullanıcı oturumunun bu tablolara yazma yetkisi YOKTUR (yetki genişletmesi ürün kararı bekliyor — docs/tasima-ilerleme.md).
 */
export async function onerileriKontrolEt(): Promise<SonucDurumu> {
  const { bag } = await yetkiliKlinikAdminGetir();
  if (!bag) return { success: false, message: "Bu işlem için yetkiniz yok." };
  return { success: false, message: "Bayram önerileri her ay otomatik güncellenir. Acil bir tarih için aşağıdaki formdan elle tatil ekleyebilirsiniz." };
}

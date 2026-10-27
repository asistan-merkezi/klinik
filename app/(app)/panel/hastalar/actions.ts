"use server";

import { after } from "next/server";
import { hastaHosgeldinTetikle } from "@/lib/mesaj/hasta-mesaji";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI, type PersonelRolu } from "@/lib/auth/yetki";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import { revalidateHastaDetay } from "./[id]/revalidate";

type SonucDurumu = { success: boolean; message: string } | null;

// Rol kümeleri RLS ile birebir: hasta kaydı/güncellemesi yönetim rolleri (hasta_yonet_resepsiyon_admin), KVKK onayı da aynı küme.
const HASTA_YONETIM_ROLLERI: readonly PersonelRolu[] = ["klinik_admin", "resepsiyon"];

const telefonSemasi = z
  .string()
  .trim()
  .min(7, "Telefon numarası geçersiz.")
  .max(20, "Telefon numarası geçersiz.")
  .regex(/^[0-9+ ]+$/, "Telefon sadece rakam, boşluk ve + içerebilir.");

const hastaSemasi = z.object({
  ad_soyad: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı."),
  telefon: telefonSemasi,
  dogum_tarihi: z.union([z.string().date(), z.literal("")]).optional(),
  whatsapp_izin_durumu: z.coerce.boolean().optional(),
});

const kimlikOlusturSemasi = z.object({
  kimlik_no: z.string().trim().optional(),
  kimlik_no_tipi: z.enum(["tc", "pasaport"]).optional(),
  ticari_ileti_onay: z.coerce.boolean().optional(),
});

async function yetkiAl() {
  const y = await eylemYetkisi(HASTA_YONETIM_ROLLERI);
  if (!y.yetkili || !y.bag || !y.klinikId) return null;
  return { bag: y.bag, klinikId: y.klinikId, userId: y.ctx.userId };
}

export async function hastaOlustur(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const y = await yetkiAl();
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = hastaSemasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    whatsapp_izin_durumu: formData.get("whatsapp_izin_durumu") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const kimlikAyristirma = kimlikOlusturSemasi.safeParse({
    kimlik_no: formData.get("kimlik_no") ?? "",
    kimlik_no_tipi: formData.get("kimlik_no_tipi") || undefined,
    ticari_ileti_onay: formData.get("ticari_ileti_onay") === "on",
  });

  if (!kimlikAyristirma.success) {
    return { success: false, message: kimlikAyristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad_soyad, telefon, dogum_tarihi, whatsapp_izin_durumu } = ayristirma.data;
  const { kimlik_no, kimlik_no_tipi, ticari_ileti_onay } = kimlikAyristirma.data;

  let yeniHastaId: string;
  try {
    // Hasta + kimlik satırı TEK transaction: eşzamanlı çakışmada (23505) yarım kalmış kimliksiz hasta bırakılmaz (eskiden elle silinirdi).
    const sonuc = await withTenant(y.bag, async (tx) => {
      if (kimlik_no) {
        const mevcut = await tx
          .select({ hastaId: sema.hastaHassas.hastaId })
          .from(sema.hastaHassas)
          .where(and(eq(sema.hastaHassas.klinikId, y.klinikId), eq(sema.hastaHassas.kimlikNo, kimlik_no)))
          .limit(1);
        if (mevcut.length > 0) return { hata: "Bu kimlik numarasına sahip bir hasta zaten kayıtlı." };
      }

      const [yeni] = await tx
        .insert(sema.hasta)
        .values({
          klinikId: y.klinikId,
          adSoyad: isimBasHarfBuyukYap(ad_soyad),
          telefon,
          dogumTarihi: dogum_tarihi ? dogum_tarihi : null,
          whatsappIzinDurumu: whatsapp_izin_durumu ?? false,
          ticariIletiOnayTarihi: ticari_ileti_onay ? new Date().toISOString() : null,
        })
        .returning({ id: sema.hasta.id });

      if (kimlik_no) {
        await tx.insert(sema.hastaHassas).values({ hastaId: yeni.id, klinikId: y.klinikId, kimlikNo: kimlik_no, kimlikNoTipi: kimlik_no_tipi ?? "tc" });
      }
      return { id: yeni.id };
    });
    if ("hata" in sonuc) return { success: false, message: sonuc.hata ?? "Hasta oluşturulamadı." };
    yeniHastaId = sonuc.id;
  } catch (e) {
    const h = pgHata(e);
    console.error("Hasta oluşturulamadı:", h.mesaj);
    return {
      success: false,
      message: h.kod === "23505" ? "Bu kimlik numarasına sahip bir hasta zaten kayıtlı." : "Hasta oluşturulamadı, lütfen tekrar deneyin.",
    };
  }

  revalidatePath("/panel/hastalar");
  after(() => hastaHosgeldinTetikle(y.bag, yeniHastaId));
  return { success: true, message: "Hasta kaydedildi." };
}

export async function hastaGuncelle(
  hastaId: string,
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const y = await yetkiAl();
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  const ayristirma = hastaSemasi.safeParse({
    ad_soyad: formData.get("ad_soyad"),
    telefon: formData.get("telefon"),
    dogum_tarihi: formData.get("dogum_tarihi") ?? "",
    whatsapp_izin_durumu: formData.get("whatsapp_izin_durumu") === "on",
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { ad_soyad, telefon, dogum_tarihi, whatsapp_izin_durumu } = ayristirma.data;

  try {
    const guncellenen = await withTenant(y.bag, (tx) =>
      tx
        .update(sema.hasta)
        .set({
          adSoyad: isimBasHarfBuyukYap(ad_soyad),
          telefon,
          dogumTarihi: dogum_tarihi ? dogum_tarihi : null,
          whatsappIzinDurumu: whatsapp_izin_durumu ?? false,
        })
        .where(eq(sema.hasta.id, hastaId))
        .returning({ id: sema.hasta.id })
    );
    if (guncellenen.length === 0) return { success: false, message: "Hasta bulunamadı." };
  } catch (e) {
    console.error("Hasta güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Hasta güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/hastalar");
  revalidateHastaDetay(hastaId);
  revalidatePath("/panel/randevular");
  return { success: true, message: "Hasta güncellendi." };
}

export async function kvkkOnayVer(hastaId: string): Promise<SonucDurumu> {
  const y = await yetkiAl();
  if (!y) return { success: false, message: YETKISIZ_MESAJI };

  try {
    const guncellenen = await withTenant(y.bag, (tx) =>
      tx
        .update(sema.hasta)
        .set({ kvkkOnayTarihi: new Date().toISOString(), kvkkOnaylayanTip: "personel", kvkkOnaylayanKullaniciId: y.userId })
        .where(eq(sema.hasta.id, hastaId))
        .returning({ id: sema.hasta.id })
    );
    if (guncellenen.length === 0) return { success: false, message: "Hasta bulunamadı." };
  } catch (e) {
    console.error("KVKK onayı kaydedilemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/hastalar");
  revalidateHastaDetay(hastaId);
  return { success: true, message: "KVKK onayı kaydedildi." };
}

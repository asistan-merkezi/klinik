"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

const tabletAyarlariSemasi = z.object({
  hasta_adi_goster: z.boolean(),
  terapist_adi_goster: z.boolean(),
  islem_adi_goster: z.boolean(),
  durum_rengi_goster: z.boolean(),
  tema: z.enum(["acik", "koyu"]),
});

export async function tabletAyarlariGuncelle(
  _onceki: SonucDurumu,
  formData: FormData
): Promise<SonucDurumu> {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId || y.ctx.rol !== "klinik_admin") {
    return { success: false, message: YETKISIZ_MESAJI };
  }
  const { bag, klinikId } = y;

  const ayristirma = tabletAyarlariSemasi.safeParse({
    hasta_adi_goster: formData.get("hasta_adi_goster") === "on",
    terapist_adi_goster: formData.get("terapist_adi_goster") === "on",
    islem_adi_goster: formData.get("islem_adi_goster") === "on",
    durum_rengi_goster: formData.get("durum_rengi_goster") === "on",
    tema: formData.get("tema"),
  });

  if (!ayristirma.success) {
    return { success: false, message: "Girdi hatalı." };
  }

  // klinik_ayarlar.ayarlar tek bir jsonb kolonu: düz upsert diğer anahtarları silebileceği için satır kilitlenip okunur, "tablet" anahtarı üstüne yazılır.
  try {
    await withTenant(bag, async (tx) => {
      const mevcut = (await tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, klinikId)).for("update").limit(1))[0];
      const guncelAyarlar = { ...(mevcut?.ayarlar as Record<string, unknown> | null), tablet: ayristirma.data };
      await tx.insert(sema.klinikAyarlar).values({ klinikId, ayarlar: guncelAyarlar }).onConflictDoUpdate({ target: sema.klinikAyarlar.klinikId, set: { ayarlar: guncelAyarlar } });
    });
  } catch (e) {
    console.error("Tablet görünüm ayarları güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/tablet/ayarlar");
  return { success: true, message: "Tablet görünüm ayarları kaydedildi." };
}

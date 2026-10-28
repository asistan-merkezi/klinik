"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";

type SonucDurumu = { success: boolean; message: string } | null;

/**
 * Sadece "Beklemede" / "Olumsuz" için — "Olumlu" ayrı bir akış (Personel
 * oluşturma sihirbazını başvuru bilgileriyle açar, bkz. basvuru-satiri.tsx),
 * burada değil actions.ts'teki personelHesabiOlustur içinde işleniyor.
 */
export async function basvuruDurumGuncelle(id: string, durum: "beklemede" | "olumsuz"): Promise<SonucDurumu> {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || y.ctx.rol !== "klinik_admin") {
    return { success: false, message: YETKISIZ_MESAJI };
  }
  if (!z.string().uuid().safeParse(id).success || (durum !== "beklemede" && durum !== "olumsuz")) {
    return { success: false, message: "Başvuru bulunamadı." };
  }

  try {
    const g = await withTenant(y.bag, (tx) =>
      tx
        .update(sema.isBasvurusu)
        .set({ durum, degerlendirenKullaniciId: y.ctx.userId, degerlendirmeTarihi: new Date().toISOString() })
        // Zaten bir personele aktarılmış (olumlu) bir başvuru burada geri alınamaz.
        .where(and(eq(sema.isBasvurusu.id, id), isNull(sema.isBasvurusu.personelId)))
        .returning({ id: sema.isBasvurusu.id })
    );
    if (g.length === 0) return { success: false, message: "Başvuru bulunamadı veya zaten personele aktarılmış." };
  } catch (e) {
    console.error("İş başvurusu güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/personel/basvurular");
  return { success: true, message: "Güncellendi." };
}

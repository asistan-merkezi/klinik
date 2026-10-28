"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { serbestMetniTemizle } from "@/lib/destek/metin";
import type { DestekDurum } from "@/types/destek";

type SonucDurumu = { success: boolean; message: string } | null;

const UUID = z.string().uuid();
const talepSemasi = z.object({
  tur: z.enum(["talep", "sikayet"]),
  konu: z.string().trim().min(1, "Konu gerekli.").max(200),
  aciklama: z.string().trim().min(1, "Açıklama gerekli.").max(4000),
});

/**
 * Her personel rolü talep/şikayet açabilir. Serbest metin kişisel/sağlık verisi içerebilir: kontrol karakterleri temizlenir, çıktı React'te
 * (otomatik kaçışlı, `dangerouslySetInnerHTML` yok) gösterilir. Klinik ve kullanıcı oturumdan gelir (istemciden ALINMAZ); RLS ek sınırdır.
 */
export async function talepOlustur(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  const y = await eylemYetkisi(["klinik_admin", "resepsiyon", "terapist", "muhasebe"]);
  if (!y.yetkili || !y.bag || !y.klinikId) return { success: false, message: y.klinikId ? YETKISIZ_MESAJI : "Kliniğiniz bulunamadı." };

  const ayristirma = talepSemasi.safeParse({
    tur: formData.get("tur"),
    konu: serbestMetniTemizle(String(formData.get("konu") ?? "")),
    aciklama: serbestMetniTemizle(String(formData.get("aciklama") ?? "")),
  });
  if (!ayristirma.success) return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };

  try {
    await withTenant(y.bag, (tx) => tx.insert(sema.destekTalebi).values({ klinikId: y.klinikId!, kullaniciId: y.ctx.userId, ...ayristirma.data }));
  } catch (e) {
    console.error("Destek talebi oluşturulamadı:", pgHata(e).mesaj);
    return { success: false, message: "Gönderilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/destek/talep-sikayetler");
  return { success: true, message: "Gönderildi." };
}

/** Durum yönetimi yalnız klinik_admin (kendi kliniği) — ya da destek bağlamındaki super_admin. Kod + RLS aynı kuralı uygular. */
export async function talepDurumGuncelle(id: string, durum: DestekDurum): Promise<SonucDurumu> {
  const y = await eylemYetkisi(["klinik_admin"]);
  if (!y.yetkili || !y.bag || !y.klinikId) return { success: false, message: YETKISIZ_MESAJI };
  if (!UUID.safeParse(id).success || !["yeni", "inceleniyor", "cozuldu"].includes(durum)) return { success: false, message: "Girdi hatalı." };

  try {
    const g = await withTenant(y.bag, (tx) =>
      tx
        .update(sema.destekTalebi)
        .set({ durum, guncellenmeTarihi: new Date().toISOString() })
        .where(and(eq(sema.destekTalebi.id, id), eq(sema.destekTalebi.klinikId, y.klinikId!)))
        .returning({ id: sema.destekTalebi.id })
    );
    if (g.length === 0) return { success: false, message: "Talep bulunamadı." };
  } catch (e) {
    console.error("Destek talebi durumu güncellenemedi:", pgHata(e).mesaj);
    return { success: false, message: "Güncellenemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/destek/talep-sikayetler");
  return { success: true, message: "Güncellendi." };
}

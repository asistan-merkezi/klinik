"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sema, withTenant } from "@/lib/db";
import { eylemYetkisi, YETKISIZ_MESAJI } from "@/lib/auth/yetki";
import { GizliAnahtarYok, gizliSifrele } from "@/lib/guvenlik/gizli-sifrele";

type SonucDurumu = { success: boolean; message: string } | null;

function bosIseNull(deger: FormDataEntryValue | null) {
  if (deger == null) return null;
  const s = String(deger).trim();
  return s === "" ? null : s;
}

const muhasebeSyncSemasi = z.object({
  parasut_client_id: z.string().trim().min(1, "Client ID gerekli."),
  parasut_client_secret: z.string().nullable(),
  parasut_company_id: z.string().trim().min(1, "Şirket (Company) ID gerekli."),
});

export async function muhasebeSyncGuncelle(_onceki: SonucDurumu, formData: FormData): Promise<SonucDurumu> {
  // Yalnız klinik_admin (super_admin klinik bağlamı olmadığından zaten eleniyor: bag null).
  const yetki = await eylemYetkisi(["klinik_admin"]);
  if (!yetki.yetkili || !yetki.bag || !yetki.klinikId || yetki.ctx.rol !== "klinik_admin") {
    return { success: false, message: YETKISIZ_MESAJI };
  }
  const { bag, klinikId } = yetki;

  const ayristirma = muhasebeSyncSemasi.safeParse({
    parasut_client_id: formData.get("parasut_client_id"),
    parasut_client_secret: bosIseNull(formData.get("parasut_client_secret")),
    parasut_company_id: formData.get("parasut_company_id"),
  });

  if (!ayristirma.success) {
    return { success: false, message: ayristirma.error.issues[0]?.message ?? "Girdi hatalı." };
  }

  const { parasut_client_id, parasut_client_secret, parasut_company_id } = ayristirma.data;

  try {
    await withTenant(bag, async (tx) => {
      // Secret alanı boş bırakılırsa mevcut değer korunur (formda hiçbir zaman gösterilmediği için "boş = değiştirme").
      // Secret kolonu uygulama rolüne SELECT'e kapalı: var olup olmadığı üretilmiş boolean kolondan (parasut_secret_var, migration 0006) okunur.
      let secretVar = Boolean(parasut_client_secret);
      if (!secretVar) {
        const mevcut = await tx
          .select({ var: sema.klinikMuhasebeEntegrasyonu.parasutSecretVar })
          .from(sema.klinikMuhasebeEntegrasyonu)
          .where(eq(sema.klinikMuhasebeEntegrasyonu.klinikId, klinikId))
          .limit(1);
        secretVar = Boolean(mevcut[0]?.var);
      }
      const baglandiMi = Boolean(parasut_client_id && parasut_company_id && secretVar);
      const degerler = {
        parasutClientId: parasut_client_id,
        // Secret veritabanına DÜZ yazılmaz: uygulama anahtarıyla (GIZLI_VERI_ANAHTARI) kliniğe bağlı AES-256-GCM; anahtar yoksa kayıt reddedilir.
        ...(parasut_client_secret ? { parasutClientSecret: gizliSifrele(parasut_client_secret, klinikId) } : {}),
        parasutCompanyId: parasut_company_id,
        baglantiDurumu: baglandiMi ? "baglandi" : "bekliyor",
      };
      await tx
        .insert(sema.klinikMuhasebeEntegrasyonu)
        .values({ klinikId, ...degerler })
        .onConflictDoUpdate({ target: sema.klinikMuhasebeEntegrasyonu.klinikId, set: degerler });
    });
  } catch (error) {
    if (error instanceof GizliAnahtarYok) {
      return { success: false, message: "Sunucuda gizli veri şifreleme anahtarı tanımlı değil; Paraşüt gizli anahtarı kaydedilemez. Sistem yöneticisine bildirin." };
    }
    // Hata nesnesi gizli değer içerebilecek sorgu parametrelerini taşıyabilir → yalnız mesajı logla.
    console.error("Muhasebe Sync ayarları kaydedilemedi:", error instanceof Error ? error.message : "bilinmeyen hata");
    return { success: false, message: "Kaydedilemedi, lütfen tekrar deneyin." };
  }

  revalidatePath("/panel/ayarlar/muhasebe-sync");
  return { success: true, message: "Muhasebe Sync bilgileri kaydedildi." };
}

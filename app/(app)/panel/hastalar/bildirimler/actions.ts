"use server";

import { revalidatePath } from "next/cache";
import { and, inArray, isNull } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { eylemYetkisi } from "@/lib/auth/yetki";
import { z } from "zod";

/**
 * Anket ve Öneriler / Seans Değerlendirmeleri satırlarında durum alanı yok
 * (randevu_iptal_talebi/randevu_talebi'nin aksine) — "görüldü" bilgisi
 * goruldu_tarihi ile tutuluyor. Bildirimler sayfası GERÇEKTEN mount olunca
 * (client useEffect, Next.js Link prefetch'te ÇALIŞMAZ çünkü prefetch sadece
 * RSC payload'ını indirir, component hydrate/mount edilmez) o an ekrandaki
 * satırların id'leri bu action'a gönderilip klinik geneli "görüldü"
 * işaretleniyor — bu yüzden başka bir personel de aynı anda Bildirimler'i
 * açsa bile bildirim durumu paylaşılan/tek bir klinik state'i.
 * Yalnız Bildirimler sayfasını görebilen roller (klinik_admin/resepsiyon); yetkisiz çağrı sessizce hiçbir şey yapmaz.
 */
const idListesi = z.array(z.string().uuid()).max(200);

export async function bildirimleriGoruldiIsaretle(anketIdleri: string[], seansIdleri: string[]): Promise<void> {
  const y = await eylemYetkisi(["klinik_admin", "resepsiyon"]);
  if (!y.yetkili || !y.bag) return;
  const anket = idListesi.safeParse(anketIdleri);
  const seans = idListesi.safeParse(seansIdleri);
  if (!anket.success || !seans.success) return;

  const simdi = new Date().toISOString();
  await withTenant(y.bag, async (tx) => {
    if (anket.data.length > 0) {
      await tx.update(sema.anketYaniti).set({ gorulduTarihi: simdi }).where(and(inArray(sema.anketYaniti.id, anket.data), isNull(sema.anketYaniti.gorulduTarihi)));
    }
    if (seans.data.length > 0) {
      await tx.update(sema.seansDegerlendirme).set({ gorulduTarihi: simdi }).where(and(inArray(sema.seansDegerlendirme.id, seans.data), isNull(sema.seansDegerlendirme.gorulduTarihi)));
    }
  });

  revalidatePath("/panel/hastalar");
  revalidatePath("/panel/hastalar/bildirimler");
}

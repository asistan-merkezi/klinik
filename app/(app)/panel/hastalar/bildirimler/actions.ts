"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Anket ve Öneriler / Seans Değerlendirmeleri satırlarında durum alanı yok
 * (randevu_iptal_talebi/randevu_talebi'nin aksine) — "görüldü" bilgisi
 * goruldu_tarihi ile tutuluyor. Bildirimler sayfası GERÇEKTEN mount olunca
 * (client useEffect, Next.js Link prefetch'te ÇALIŞMAZ çünkü prefetch sadece
 * RSC payload'ını indirir, component hydrate/mount edilmez) o an ekrandaki
 * satırların id'leri bu action'a gönderilip klinik geneli "görüldü"
 * işaretleniyor — bu yüzden başka bir personel de aynı anda Bildirimler'i
 * açsa bile bildirim durumu paylaşılan/tek bir klinik state'i.
 */
export async function bildirimleriGoruldiIsaretle(anketIdleri: string[], seansIdleri: string[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const simdi = new Date().toISOString();

  await Promise.all([
    anketIdleri.length > 0
      ? supabase.from("anket_yaniti").update({ goruldu_tarihi: simdi }).in("id", anketIdleri).is("goruldu_tarihi", null)
      : Promise.resolve(),
    seansIdleri.length > 0
      ? supabase
          .from("seans_degerlendirme")
          .update({ goruldu_tarihi: simdi })
          .in("id", seansIdleri)
          .is("goruldu_tarihi", null)
      : Promise.resolve(),
  ]);

  revalidatePath("/panel/hastalar");
  revalidatePath("/panel/hastalar/bildirimler");
}

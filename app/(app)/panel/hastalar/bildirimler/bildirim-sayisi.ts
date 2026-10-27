import { cache } from "react";
import { and, count, eq, isNull } from "drizzle-orm";
import type { createClient } from "@/lib/supabase/server";
import { withTenant, sema, type TenantBaglami } from "@/lib/db";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Hastalar > Bildirimler butonunun renk değiştirmesi için toplam sayı:
 * bekleyen randevu iptal/talep talepleri (durum='bekliyor' zaten "işlenmedi"
 * sinyali) + henüz görülmemiş (goruldu_tarihi IS NULL) anket/seans
 * değerlendirmesi. Hem Hastalar liste sayfasındaki buton hem Bildirimler
 * sayfasının kendisi aynı sayıyı paylaşsın diye tek yerde.
 *
 * React cache() ile sarılı: panel/layout.tsx VE panel/hastalar/page.tsx aynı
 * istek içinde ikisi de çağırıyordu, ölçümde bu tek başına ~100-200ms'lik
 * tekrar eden bir round-trip olarak görüldü (createClient() de cache()'li
 * olduğu için `supabase` argümanı aynı referans, dedup güvenli çalışıyor).
 */
export const bildirimSayisiGetir = cache(async (supabase: Supabase): Promise<number> => {
  const [iptal, randevuTalep, anket, seansDegerlendirme] = await Promise.all([
    supabase.from("randevu_iptal_talebi").select("id", { count: "exact", head: true }).eq("durum", "bekliyor"),
    supabase.from("randevu_talebi").select("id", { count: "exact", head: true }).eq("durum", "bekliyor"),
    supabase.from("anket_yaniti").select("id", { count: "exact", head: true }).is("goruldu_tarihi", null),
    supabase.from("seans_degerlendirme").select("id", { count: "exact", head: true }).is("goruldu_tarihi", null),
  ]);

  return (
    (iptal.count ?? 0) + (randevuTalep.count ?? 0) + (anket.count ?? 0) + (seansDegerlendirme.count ?? 0)
  );
});

/**
 * YENİ (Drizzle + withTenant): aynı sayı. Layout bunu kullanır; Hastalar sayfası modül 2'de taşınınca eski sürüm silinir.
 * Savunma derinliği: görünürlük kuralı (klinik_admin/resepsiyon) çağıran tarafta uygulanır (layout).
 */
export const bildirimSayisi = cache(async (bag: TenantBaglami): Promise<number> => {
  const [iptal, randevuTalep, anket, seansDeg] = await withTenant(bag, (tx) =>
    Promise.all([
      tx.select({ n: count() }).from(sema.randevuIptalTalebi).where(eq(sema.randevuIptalTalebi.durum, "bekliyor")),
      tx.select({ n: count() }).from(sema.randevuTalebi).where(eq(sema.randevuTalebi.durum, "bekliyor")),
      tx.select({ n: count() }).from(sema.anketYaniti).where(isNull(sema.anketYaniti.gorulduTarihi)),
      tx.select({ n: count() }).from(sema.seansDegerlendirme).where(and(isNull(sema.seansDegerlendirme.gorulduTarihi))),
    ])
  );
  return (iptal[0]?.n ?? 0) + (randevuTalep[0]?.n ?? 0) + (anket[0]?.n ?? 0) + (seansDeg[0]?.n ?? 0);
});

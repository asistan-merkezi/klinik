import { cache } from "react";
import { and, count, eq, isNull } from "drizzle-orm";
import { withTenant, sema, type TenantBaglami } from "@/lib/db";

/**
 * Hastalar > Bildirimler butonunun renk değiştirmesi için toplam sayı:
 * bekleyen randevu iptal/talep talepleri (durum='bekliyor' zaten "işlenmedi"
 * sinyali) + henüz görülmemiş (goruldu_tarihi IS NULL) anket/seans
 * değerlendirmesi. Hem Hastalar liste sayfasındaki buton hem Bildirimler
 * sayfasının kendisi aynı sayıyı paylaşsın diye tek yerde.
 *
 * React cache() ile sarılı: panel/layout.tsx VE panel/hastalar/page.tsx aynı
 * istek içinde ikisi de çağırıyordu. `bag` istek başına tek damgalı nesne olduğundan (oturumBaglami cache'i) dedup güvenli çalışır.
 * Savunma derinliği: görünürlük kuralı (klinik_admin/resepsiyon) çağıran tarafta uygulanır (layout, hastalar sayfası).
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

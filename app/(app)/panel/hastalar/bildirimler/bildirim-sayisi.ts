import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Hastalar > Bildirimler butonunun renk değiştirmesi için toplam sayı:
 * bekleyen randevu iptal/talep talepleri (durum='bekliyor' zaten "işlenmedi"
 * sinyali) + henüz görülmemiş (goruldu_tarihi IS NULL) anket/seans
 * değerlendirmesi. Hem Hastalar liste sayfasındaki buton hem Bildirimler
 * sayfasının kendisi aynı sayıyı paylaşsın diye tek yerde.
 */
export async function bildirimSayisiGetir(supabase: Supabase): Promise<number> {
  const [iptal, randevuTalep, anket, seansDegerlendirme] = await Promise.all([
    supabase.from("randevu_iptal_talebi").select("id", { count: "exact", head: true }).eq("durum", "bekliyor"),
    supabase.from("randevu_talebi").select("id", { count: "exact", head: true }).eq("durum", "bekliyor"),
    supabase.from("anket_yaniti").select("id", { count: "exact", head: true }).is("goruldu_tarihi", null),
    supabase.from("seans_degerlendirme").select("id", { count: "exact", head: true }).is("goruldu_tarihi", null),
  ]);

  return (
    (iptal.count ?? 0) + (randevuTalep.count ?? 0) + (anket.count ?? 0) + (seansDegerlendirme.count ?? 0)
  );
}

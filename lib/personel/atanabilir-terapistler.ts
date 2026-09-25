import type { createClient } from "@/lib/supabase/server";
import type { SecenekSatir } from "@/types/randevu";

type TerapistSatir = {
  id: string;
  personel: { ad_soyad: string; isten_cikis_tarihi: string | null } | null;
};

/**
 * Randevu/seans oluşturma ekranlarındaki terapist seçim listesi — işten
 * çıkış tarihi BUGÜNDEN ÖNCE olan terapistler hariç tutulur (çıkış günü
 * dahil son gün hâlâ seçilebilir). `terapist` tablosunun kendisi hiç
 * filtrelenmiyordu, bu yüzden ayrılmış bir terapiste sınırsız yeni randevu
 * atanabiliyordu — bu, o kişinin hakedişine (prim) de yansıyordu çünkü prim
 * tamamlanan seans sayısına dayanıyor (bkz. lib/maas.ts, lib/personel/hakedis.ts).
 * Geçmiş/arşiv randevu içe aktarımında (ayrılmış birinin eski kayıtları
 * meşru olabilir) bu filtre KULLANILMAMALI.
 */
export async function atanabilirTerapistleriGetir(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<SecenekSatir[]> {
  const { data } = await supabase
    .from("terapist")
    .select("id, personel(ad_soyad, isten_cikis_tarihi)")
    .returns<TerapistSatir[]>();

  const bugun = new Date().toISOString().slice(0, 10);

  return (data ?? [])
    .filter((t) => !t.personel?.isten_cikis_tarihi || t.personel.isten_cikis_tarihi >= bugun)
    .map((t) => ({ id: t.id, ad: t.personel?.ad_soyad ?? "—" }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}

/**
 * Seçim listesindeki filtre yalnızca UI kolaylığı — dialog açıkken tarih
 * girilip kaydedilirse veya biri eski bir sekmeden eski bir formu gönderirse
 * client'tan gelen terapist_id'yi doğrulamadan güvenmek olmaz. Randevu
 * oluşturan/güncelleyen her server action bunu çağırmalı (bkz. randevular/actions.ts).
 */
export async function terapistAtanabilirMi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  terapistId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("terapist")
    .select("personel(isten_cikis_tarihi)")
    .eq("id", terapistId)
    .maybeSingle<{ personel: { isten_cikis_tarihi: string | null } | null }>();

  const cikisTarihi = data?.personel?.isten_cikis_tarihi;
  if (!cikisTarihi) return true;

  const bugun = new Date().toISOString().slice(0, 10);
  return cikisTarihi >= bugun;
}

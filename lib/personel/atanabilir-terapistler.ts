import { eq } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import type { TerapistSecenekSatir } from "@/types/randevu";

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
export async function atanabilirTerapistleriGetir(tx: Tx): Promise<TerapistSecenekSatir[]> {
  const satirlar = await tx
    .select({ id: sema.terapist.id, ad: sema.personel.adSoyad, cikis: sema.personel.istenCikisTarihi, pozisyonId: sema.personel.pozisyonId })
    .from(sema.terapist)
    .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId));

  const bugun = bugunIstanbulTarihi();

  return satirlar
    .filter((t) => !t.cikis || t.cikis >= bugun)
    .map((t) => ({ id: t.id, ad: t.ad ?? "—", pozisyon_id: t.pozisyonId ?? null }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}

/**
 * Seçim listesindeki filtre yalnızca UI kolaylığı — dialog açıkken tarih
 * girilip kaydedilirse veya biri eski bir sekmeden eski bir formu gönderirse
 * client'tan gelen terapist_id'yi doğrulamadan güvenmek olmaz. Randevu
 * oluşturan/güncelleyen her server action bunu çağırmalı (bkz. randevular/actions.ts).
 * Terapist başka kliniğin ya da yoksa RLS satırı göstermez: `true` döner (eski davranış — atanabilirlik YALNIZ çıkış tarihine bakar;
 * varlık/klinik denetimi randevu INSERT'ünün RLS/FK kontrolünde yapılır).
 */
export async function terapistAtanabilirMi(tx: Tx, terapistId: string): Promise<boolean> {
  const satir = (
    await tx
      .select({ cikis: sema.personel.istenCikisTarihi })
      .from(sema.terapist)
      .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId))
      .where(eq(sema.terapist.id, terapistId))
      .limit(1)
  )[0];
  const cikisTarihi = satir?.cikis;
  if (!cikisTarihi) return true;
  return cikisTarihi >= bugunIstanbulTarihi();
}

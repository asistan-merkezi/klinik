import { asc, inArray } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";
import { tl } from "@/lib/para";

/**
 * Bir dönemin hakedişinde kullanılacak sabit maaş — personel.maas GÜNCEL değerdir; geçmiş bir ay
 * (geç kapatılan, cron'un geriye dönük yakaladığı, yeniden açılıp kapatılan ya da Raporlar'da
 * görüntülenen ay) o ayın maaşıyla hesaplanmalı. Kaynak: personel_ucret (append-only maaş geçmişi).
 *
 * Kural: AYIN SON GÜNÜ itibarıyla geçerli maaş (gecerlilik_tarihi < ayBitisTarihExclusive olan en
 * son satır). Dönem ayın 1'inde kapandığı için bu, önceki davranışla (kapanış anındaki maaş) normal
 * durumda aynıdır; yalnız geç kapanışta ve geçmiş raporlarda farklılaşır. Ay içi zam oranlanmaz.
 * O tarihten önce satır yoksa bilinen ilk maaş, hiç satır yoksa personel.maas kullanılır.
 */
export type MaasGecmisiSatiri = { gecerlilik_tarihi: string; maas: number; created_at: string };

/** Saf. Test: donem-maasi.test.ts */
export function donemMaasi(
  gecmis: MaasGecmisiSatiri[] | undefined,
  guncelMaas: number | null,
  ayBitisTarihExclusive: string
): number | null {
  if (!gecmis || gecmis.length === 0) return guncelMaas;
  const sirali = [...gecmis].sort(
    (a, b) => a.gecerlilik_tarihi.localeCompare(b.gecerlilik_tarihi) || a.created_at.localeCompare(b.created_at)
  );
  let secilen: MaasGecmisiSatiri | null = null;
  for (const s of sirali) {
    if (s.gecerlilik_tarihi < ayBitisTarihExclusive) secilen = s;
    else break;
  }
  return Number((secilen ?? sirali[0]).maas);
}

/** personel_id → maaş geçmişi (RLS'e tabidir: klinik_admin/muhasebe görür; göremeyen rol için boş döner ve donemMaasi personel.maas'a düşer). */
export async function maasGecmisiGetirTx(tx: Tx, personelIdler: string[]): Promise<Map<string, MaasGecmisiSatiri[]>> {
  const sonuc = new Map<string, MaasGecmisiSatiri[]>();
  const ids = [...new Set(personelIdler)];
  if (ids.length === 0) return sonuc;
  const U = sema.personelUcret;
  const satirlar = await tx
    .select({ personel_id: U.personelId, gecerlilik_tarihi: U.gecerlilikTarihi, maas: U.maas, created_at: U.createdAt })
    .from(U)
    .where(inArray(U.personelId, ids))
    .orderBy(asc(U.id));
  for (const s of satirlar) {
    const liste = sonuc.get(s.personel_id) ?? [];
    liste.push({ gecerlilik_tarihi: s.gecerlilik_tarihi, maas: tl(s.maas), created_at: s.created_at });
    sonuc.set(s.personel_id, liste);
  }
  return sonuc;
}

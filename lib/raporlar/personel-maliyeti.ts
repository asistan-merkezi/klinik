import type { SabitPersonelMaliyeti, TerapistPrimSatiri } from "@/types/raporlar";

/**
 * Raporlar'ın personel gideri — saf toplama (test: personel-maliyeti.test.ts).
 *
 * Kaynaklar (çift sayım YOK):
 *  - KAPALI dönemler: personel_hesap_hareket'teki gerçek tahakkuk. Dönem kapanışının yazdığı
 *    `hakedis` + dönem `prim`'i (kaynak_id dolu) → sabit gider.
 *  - AÇIK dönemler (henüz kapanmamış ay-personel çiftleri): o ayın maaşıyla tahmin (taban + seans
 *    primi, lib/personel/hakedis.ts) → sabit gider.
 *  - Elle girilen prim (kaynak_id boş), yol, yemek ve mesai satırları → ekstra gider (hangi dönem
 *    olursa olsun defterden).
 * avans/kesinti/odeme maliyet değil (tahakkukun ödenmesi), hiç sayılmaz.
 *
 * Önceki hesap: yalnız BUGÜN aktif personeli GÜNCEL maaşla bir kez sayıyordu — yıllık raporda tüm yıl
 * için tek aylık maaş, kapalı aylarda seans primi hem formülden hem defterden (iki kez), ayrılan
 * personelin geçmiş maliyeti hiç, sonradan girenin ise girmeden önceki ayları da sayılıyordu.
 */

export type DefterSatiri = { personel_id: string; tur: string; tutar: number; kaynak_id: string | null };
export type DonemTahmini = { personelId: string; taban: number; prim: number; seans: number };
export type PersonelBilgisi = { id: string; ad_soyad: string; terapistMi: boolean };

const yuvarla = (n: number) => Math.round(n * 100) / 100;

export function personelMaliyetiniTopla(
  personeller: PersonelBilgisi[],
  defter: DefterSatiri[],
  tahminler: DonemTahmini[]
): SabitPersonelMaliyeti {
  type Kisi = { tabanKesin: number; primKesin: number; tabanTahmini: number; primTahmini: number; ekstra: number; seans: number; tahminiAy: number };
  const kisiler = new Map<string, Kisi>();
  const kisi = (id: string) => {
    let k = kisiler.get(id);
    if (!k) {
      k = { tabanKesin: 0, primKesin: 0, tabanTahmini: 0, primTahmini: 0, ekstra: 0, seans: 0, tahminiAy: 0 };
      kisiler.set(id, k);
    }
    return k;
  };

  for (const s of defter) {
    const tutar = Number(s.tutar) || 0;
    if (s.tur === "hakedis") kisi(s.personel_id).tabanKesin += tutar;
    else if (s.tur === "prim" && s.kaynak_id) kisi(s.personel_id).primKesin += tutar;
    else if (["prim", "yol", "yemek", "mesai"].includes(s.tur)) kisi(s.personel_id).ekstra += tutar;
  }
  for (const t of tahminler) {
    const k = kisi(t.personelId);
    k.tabanTahmini += t.taban;
    k.primTahmini += t.prim;
    k.seans += t.seans;
    k.tahminiAy += 1;
  }

  let sabitToplam = 0;
  let ekstraToplam = 0;
  const terapistPrimleri: TerapistPrimSatiri[] = [];
  const personelById = new Map(personeller.map((p) => [p.id, p]));

  for (const [id, k] of kisiler) {
    const taban = yuvarla(k.tabanKesin + k.tabanTahmini);
    const prim = yuvarla(k.primKesin + k.primTahmini);
    sabitToplam += taban + prim;
    ekstraToplam += k.ekstra;

    const p = personelById.get(id);
    if (p?.terapistMi && taban + prim + k.ekstra > 0) {
      const parcalar: string[] = [];
      if (k.tabanKesin + k.primKesin > 0) parcalar.push("kapalı dönem: kesin");
      if (k.tahminiAy > 0) parcalar.push(`açık dönem tahmini (${k.seans} seans)`);
      terapistPrimleri.push({
        personelId: id,
        adSoyad: p.ad_soyad,
        taban,
        prim,
        ekstraToplam: yuvarla(k.ekstra),
        toplam: yuvarla(taban + prim + k.ekstra),
        aciklama: parcalar.join(" · ") || "—",
      });
    }
  }

  terapistPrimleri.sort((a, b) => a.adSoyad.localeCompare(b.adSoyad, "tr"));
  sabitToplam = yuvarla(sabitToplam);
  ekstraToplam = yuvarla(ekstraToplam);
  return { toplamMaas: yuvarla(sabitToplam + ekstraToplam), sabitToplam, ekstraToplam, terapistPrimleri };
}

/** [baslangicTarih, bitisTarih) dönemindeki aylar ("YYYY-MM"), bugünün ayından SONRAKİLER hariç. */
export function donemAylari(baslangicTarih: string, bitisTarih: string, bugun: string): string[] {
  const aylar: string[] = [];
  let [y, a] = baslangicTarih.split("-").map(Number);
  const sonAy = bugun.slice(0, 7);
  for (;;) {
    const param = `${y}-${String(a).padStart(2, "0")}`;
    if (`${param}-01` >= bitisTarih || param > sonAy) break;
    aylar.push(param);
    a += 1;
    if (a > 12) {
      a = 1;
      y += 1;
    }
  }
  return aylar;
}

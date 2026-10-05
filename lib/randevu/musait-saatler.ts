import { toUTC } from "@/lib/datetime";

/**
 * Randevu formlarındaki "müsait saat" seçicisinin ortak hesabı (Tek Randevu +
 * Periyodik). Aday saatler çizelgenin çalışma aralığında sabit adımlı ızgaradır;
 * bir saat, seçili terapist + oda o aralıkta boşsa VE tedavinin cihazlı adımları
 * (başlangıçtan itibaren sırayla dizilir) cihaz rezervasyonlarıyla çakışmıyorsa
 * müsaittir. DB'deki exclusion constraint'lerle aynı kural — asıl güvence yine
 * constraint, bu yalnız UI kolaylığı. İzin/vardiyaya BAKMAZ.
 */

export const GUN_BASLANGIC_SAAT = 8;
export const GUN_BITIS_SAAT = 20;
export const SAAT_ADIMI_DAKIKA = 30;

export type Aralik = { bas: number; bit: number };
export type CihazAraligi = Aralik & { cihazId: string };
export type MesgulAraliklar = { kaynak: Aralik[]; cihaz: CihazAraligi[] };
export type TedaviAdimi = { sure_dakika: number | null; cihaz_id: string | null };

const pad = (n: number) => String(n).padStart(2, "0");

/** "yyyy-MM-dd" + "HH:mm" (İstanbul) → epoch ms. */
export function anMs(tarih: string, saat: string) {
  return new Date(toUTC(`${tarih}T${saat}:00`)).getTime();
}

/** Verilen tarih+saat şu andan sonra mı (geçmiş saatler seçilemez). */
export function gelecekteMi(tarih: string, saat: string) {
  return anMs(tarih, saat) > Date.now();
}

/** "yyyy-MM-dd" tarihine n gün ekler. */
export function gunEkleStr(tarih: string, n: number) {
  const d = new Date(`${tarih}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Izgaradaki aday saatler (HH:mm, sıralı); `ekstra` ızgara dışı bir saati (çizelgeden/talepten gelen) de katar. */
export function saatAdaylari(ekstra = "") {
  const adaylar: string[] = [];
  for (let dk = GUN_BASLANGIC_SAAT * 60; dk < GUN_BITIS_SAAT * 60; dk += SAAT_ADIMI_DAKIKA) {
    adaylar.push(`${pad(Math.floor(dk / 60))}:${pad(dk % 60)}`);
  }
  if (/^\d{2}:\d{2}$/.test(ekstra) && !adaylar.includes(ekstra)) adaylar.push(ekstra);
  return adaylar.sort();
}

/** Tedavinin cihazlı adımlarının pencereleri — adımlar başlangıçtan itibaren sırayla dizilir. */
export function cihazPencereleri(baslangic: number, adimlar: TedaviAdimi[], toplamSure: number): CihazAraligi[] {
  const pencereler: CihazAraligi[] = [];
  let imlec = baslangic;
  for (const a of adimlar) {
    const bit = a.sure_dakika ? imlec + a.sure_dakika * 60_000 : Math.max(baslangic + toplamSure * 60_000, imlec);
    if (a.cihaz_id && bit > imlec) pencereler.push({ cihazId: a.cihaz_id, bas: imlec, bit });
    imlec = bit;
  }
  return pencereler;
}

const cakisir = (a: Aralik, b: Aralik) => a.bas < b.bit && a.bit > b.bas;

/** Verilen tarih+saatte bu tedavi için randevu konabilir mi (gün sonu, terapist/oda, cihaz). */
export function saatMusaitMi(
  tarih: string,
  saat: string,
  sureDakika: number,
  adimlar: TedaviAdimi[],
  mesgul: MesgulAraliklar
) {
  const bas = anMs(tarih, saat);
  const aralik = { bas, bit: bas + sureDakika * 60_000 };
  if (aralik.bit > anMs(tarih, `${pad(GUN_BITIS_SAAT)}:00`)) return false;
  if (mesgul.kaynak.some((m) => cakisir(m, aralik))) return false;
  return !cihazPencereleri(bas, adimlar, sureDakika).some((p) =>
    mesgul.cihaz.some((c) => c.cihazId === p.cihazId && cakisir(c, p))
  );
}

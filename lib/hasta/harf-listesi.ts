/**
 * Hastalar listesinin harf çubuğu (ada göre). DB tarafı: hasta_bas_harf_sayilari /
 * hasta_harf_listesi (migration 20261012150000) — harfler Türkçe küçük harfle eşlenir.
 */

/** Türkçe alfabe (Ğ ile isim başlamaz, yine de listede soluk durur — alfabe eksik görünmesin). */
export const ALFABE = [
  "A", "B", "C", "Ç", "D", "E", "F", "G", "Ğ", "H", "I", "İ", "J", "K", "L",
  "M", "N", "O", "Ö", "P", "R", "S", "Ş", "T", "U", "Ü", "V", "Y", "Z",
] as const;

export const DIGER = "diger";
export const SAYFA_BOYUTU = 50;

/** "Ç" → "ç", "I" → "ı", "İ" → "i" (DB'deki turkce_kucuk_harf ile aynı eşleme). */
export function harfAnahtari(harf: string): string {
  return harf.toLocaleLowerCase("tr");
}

/** URL'deki `harf` parametresi: alfabeden bir harf, "diger" ya da tümü (null). */
export function harfParametresiCoz(deger: string | undefined): string | null {
  if (!deger) return null;
  if (deger === DIGER) return DIGER;
  return (ALFABE as readonly string[]).includes(deger) ? deger : null;
}

/** URL'deki `sayfa` parametresi (1'den başlar), toplam sayfa sayısına sıkıştırılır. */
export function sayfaParametresiCoz(deger: string | undefined, toplamKayit: number): number {
  const toplamSayfa = Math.max(1, Math.ceil(toplamKayit / SAYFA_BOYUTU));
  const n = Number(deger);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, toplamSayfa) : 1;
}

/**
 * DB'den gelen (Türkçe küçük harf → adet) satırlarını harf çubuğu sayılarına çevirir;
 * alfabe dışı baş harfler (Q, W, X, rakam…) "diger"de toplanır.
 */
export function harfSayilariniTopla(satirlar: { harf: string | null; adet: number }[]): {
  sayilar: Map<string, number>;
  toplam: number;
} {
  const anahtardanHarf = new Map(ALFABE.map((h) => [harfAnahtari(h), h as string]));
  const sayilar = new Map<string, number>();
  let toplam = 0;
  for (const s of satirlar) {
    const adet = Number(s.adet) || 0;
    toplam += adet;
    const harf = (s.harf && anahtardanHarf.get(s.harf)) || DIGER;
    sayilar.set(harf, (sayilar.get(harf) ?? 0) + adet);
  }
  return { sayilar, toplam };
}

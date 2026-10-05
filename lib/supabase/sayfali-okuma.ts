const SAYFA_BOYUTU = 1000;

/**
 * PostgREST `max_rows` (1000) sınırında tek sorgunun satırları SESSİZCE kesmesini
 * engeller: sorguyu 1000'lik sayfalarla sonuna kadar okur. Sorgu SABİT bir sıralama
 * içermeli (tarih + id). Hata olursa fırlatır — eksik veriyle yanlış bakiye/hakediş
 * göstermektense işlem hata vermeli.
 */
export async function tumSayfalariOku<T>(
  sorgu: (bas: number, son: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const tumu: T[] = [];
  for (let bas = 0; ; bas += SAYFA_BOYUTU) {
    const { data, error } = await sorgu(bas, bas + SAYFA_BOYUTU - 1);
    if (error) throw new Error(error.message);
    const satirlar = data ?? [];
    tumu.push(...satirlar);
    if (satirlar.length < SAYFA_BOYUTU) return tumu;
  }
}

/**
 * `.in(kolon, idler)` GET URL'sine gömülür; yüzlerce UUID'de URL sınırını aşıp sorgu
 * sessizce boş/hatalı döner (bkz. docs/TUZAKLAR.md). Uzun id listesini parçalara böler.
 */
export function parcalara<T>(liste: T[], boyut = 100): T[][] {
  const parcalar: T[][] = [];
  for (let i = 0; i < liste.length; i += boyut) parcalar.push(liste.slice(i, i + boyut));
  return parcalar;
}

const DEGISKEN_REGEX = /\{\{(\w+)\}\}/g;

/** Bir mesaj metnindeki {{degisken}} yer tutucularının benzersiz listesi. */
export function metindekiDegiskenler(metin: string): string[] {
  const bulunanlar = new Set<string>();
  for (const eslesme of metin.matchAll(DEGISKEN_REGEX)) bulunanlar.add(eslesme[1]);
  return Array.from(bulunanlar);
}

/** Metinde geçen ama o tetikleyici için beyaz listede olmayan değişkenler. */
export function bilinmeyenDegiskenleriBul(metin: string, gecerliDegiskenler: readonly string[]): string[] {
  const gecerliSet = new Set(gecerliDegiskenler);
  return metindekiDegiskenler(metin).filter((d) => !gecerliSet.has(d));
}

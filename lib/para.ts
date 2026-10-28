// PARA ARİTMETİĞİ — tek yer. Kural: JS'te tutar float olarak toplanmaz/çarpılmaz; tutarlar KURUŞ (güvenli tamsayı) olarak işlenir.
//   • Veritabanından numeric kolonlar Drizzle'da metin ("125.50") gelir → `kurus()` ile tamsayıya çevrilir, `kurusMetni()` ile DB'ye metin olarak yazılır.
//   • YUVARLAMA KURALI (tek tanım): kesirli kuruş, mutlak değerce YARIM YUKARI (sıfırdan uzağa) yuvarlanır — Postgres `round(numeric, 2)` ile aynı.
//   • Oranlar yüzde olarak metinle verilir ("2.5", "20"); 0,01'e kadar hassasiyet (yüzde iki hane) desteklenir.
// Kuruşun güvenli tamsayı sınırı (≈ 9×10^13 ₺) klinik ölçeğinin çok üstündedir; aşan değer hata fırlatır.

const ONDALIK = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/** "125.5" / 125.5 → 12550 kuruş. Geçersiz girdi (NaN, virgül, boş, harf) → null. 3. ondalık basamaktan sonrası yarım-yukarı yuvarlanır. */
export function kurus(girdi: string | number | null | undefined): number | null {
  if (girdi === null || girdi === undefined) return null;
  const metin = typeof girdi === "number" ? (Number.isFinite(girdi) ? sayiMetni(girdi) : "") : girdi.trim();
  const m = ONDALIK.exec(metin);
  if (!m) return null;
  const [, isaret, tam, kesir = ""] = m;
  const kesir3 = (kesir + "000").slice(0, 3);
  let k = BigInt(tam) * BigInt(100) + BigInt(kesir3.slice(0, 2));
  if (Number(kesir3[2]) >= 5) k += BigInt(1); // yarım yukarı (mutlak değerce)
  const sonuc = Number(isaret === "-" ? -k : k);
  if (!Number.isSafeInteger(sonuc)) throw new Error("tutar_cok_buyuk");
  return sonuc;
}

/** Üstel gösterimi (1e-7 gibi) düz ondalığa çevirir; float'ın 17 haneli yakınlaştırmasını 6 haneye kırpar. */
function sayiMetni(n: number): string {
  return n.toFixed(6);
}

/** 12550 → "125.50" (DB numeric'e metin olarak yazılır). */
export function kurusMetni(k: number): string {
  if (!Number.isSafeInteger(k)) throw new Error("tutar_gecersiz");
  const neg = k < 0;
  const a = Math.abs(k);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** Görüntü için: 12550 → "125,50" (binlik ayraçsız; biçimlendirme UI'dadır). */
export function kurusGoster(k: number): string {
  return kurusMetni(k).replace(".", ",");
}

export const topla = (liste: readonly number[]): number => liste.reduce((a, b) => a + b, 0);

/** Yüzde oranı (metin, ör. "2.5") → yüzde-yüzlük tamsayı (250). 2 ondalıktan fazlası yarım-yukarı yuvarlanır. */
export function oranYuzluk(oran: string | number): number {
  const k = kurus(oran);
  if (k === null || k < 0) throw new Error("oran_gecersiz");
  return k; // "2.5" → 250: oran × 100
}

function bolYuvarla(pay: bigint, payda: bigint): bigint {
  // yarım yukarı (mutlak değerce), payda > 0
  const neg = pay < BigInt(0);
  const a = neg ? -pay : pay;
  const q = (BigInt(2) * a + payda) / (BigInt(2) * payda);
  return neg ? -q : q;
}

/** `kurus` × oran% → kuruş (örn. komisyon). yuzdeKurus(10000, "2.5") = 250. */
export function yuzdeKurus(k: number, oran: string | number): number {
  return Number(bolYuvarla(BigInt(k) * BigInt(oranYuzluk(oran)), BigInt(10000)));
}

/** Net = brüt − yüzde. Bankaya düşen komisyon sonrası tutar gibi. */
export function yuzdeDus(k: number, oran: string | number): number {
  return k - yuzdeKurus(k, oran);
}

/**
 * KDV DAHİL toplamdan matrah/KDV ayrıştırma: matrah = toplam × 100 / (100 + oran), yarım yukarı kuruşa yuvarlanır; KDV = toplam − matrah
 * (böylece matrah + KDV her zaman toplama TAM eşit olur). Oran 0/boşsa matrah = toplam.
 */
export function kdvAyristir(toplam: number, kdvOrani: string | number | null | undefined): { matrah: number; kdvTutari: number } {
  const oran = kdvOrani === null || kdvOrani === undefined || kdvOrani === "" ? 0 : oranYuzluk(kdvOrani);
  if (oran <= 0) return { matrah: toplam, kdvTutari: 0 };
  const matrah = Number(bolYuvarla(BigInt(toplam) * BigInt(10000), BigInt(10000) + BigInt(oran)));
  return { matrah, kdvTutari: toplam - matrah };
}

/** İskonto sonrası net: brüt − iskonto (negatif olamaz). */
export function netTutar(brut: number, iskonto: number): number {
  return Math.max(0, brut - iskonto);
}

/** DB numeric metni ("125.50") → TL sayısı (ikiden fazla ondalık olmaz). İstemciye giden değerler bu yoldan geçer; toplama/bölme ASLA bu sayılarla yapılmaz (`tlTopla`/kuruş kullan). */
export function tl(v: string | number | null | undefined): number {
  const k = kurus(v);
  return k === null ? 0 : k / 100;
}

/** TL sayılarını kuruşa çevirip toplar (float birikim hatası yok). */
export function tlTopla(liste: readonly (number | string | null | undefined)[]): number {
  return topla(liste.map((x) => kurus(x) ?? 0)) / 100;
}

/** a − b (TL sayıları), kuruş doğrulukla. */
export function tlFark(a: number | string, b: number | string): number {
  return ((kurus(a) ?? 0) - (kurus(b) ?? 0)) / 100;
}

/** `k` kuruşun pay/payda oranı (örn. kısmi ay: maaş × çalışılan gün / ay günü), kuruşa YARIM YUKARI. payda > 0, pay ≥ 0 tamsayı. */
export function oranlaKurus(k: number, pay: number, payda: number): number {
  if (!Number.isInteger(pay) || !Number.isInteger(payda) || payda <= 0) throw new Error("oran_gecersiz");
  return Number(bolYuvarla(BigInt(k) * BigInt(pay), BigInt(payda)));
}

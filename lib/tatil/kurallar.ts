/**
 * Resmi tatil kuralları — saf fonksiyonlar (DB'ye dokunmaz, test: kurallar.test.ts).
 *
 * Sabit tarihli tatiller her yıl aynı gündedir, doğrudan kesin tatil olarak yazılır.
 * Dini bayramlar Diyanet'in açıkladığı tarihe bağlıdır; dış kaynaktan (Nager.Date) gelen
 * tarih yalnız ÖNERİDİR — 2027 Ramazan'ı Nager 10-12 Mart, Diyanet 9-11 Mart veriyor.
 * Öneriyi klinik yöneticisi onaylar (bkz. resmi_tatil_onerisi_karar RPC'si).
 */

export type Bayram = "ramazan" | "kurban";

export const BAYRAM_ADLARI: Record<Bayram, string> = {
  ramazan: "Ramazan Bayramı",
  kurban: "Kurban Bayramı",
};

const SABIT_TATILLER: { ayGun: string; ad: string }[] = [
  { ayGun: "01-01", ad: "Yılbaşı" },
  { ayGun: "04-23", ad: "Ulusal Egemenlik ve Çocuk Bayramı" },
  { ayGun: "05-01", ad: "Emek ve Dayanışma Günü" },
  { ayGun: "05-19", ad: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { ayGun: "07-15", ad: "Demokrasi ve Milli Birlik Günü" },
  { ayGun: "08-30", ad: "Zafer Bayramı" },
  { ayGun: "10-29", ad: "Cumhuriyet Bayramı" },
];

export function sabitTatiller(yil: number): { tarih: string; ad: string }[] {
  return SABIT_TATILLER.map((t) => ({ tarih: `${yil}-${t.ayGun}`, ad: t.ad }));
}

export type BayramOnerisi = { bayram: Bayram; tarih: string; ad: string };

type NagerTatil = { date: string; localName: string; name?: string };

/**
 * Nager.Date `/PublicHolidays/{yil}/TR` yanıtından dini bayram günlerini çıkarır
 * ("Ramazan Bayramı 2. Gün (Tentative Date)" → ramazan, 2. gün). Sabit tatiller atlanır.
 */
export function nagerBayramlariniAyikla(yanit: unknown, yil: number): BayramOnerisi[] {
  if (!Array.isArray(yanit)) return [];
  const sonuc: BayramOnerisi[] = [];
  for (const kayit of yanit as NagerTatil[]) {
    if (typeof kayit?.date !== "string" || typeof kayit?.localName !== "string") continue;
    if (!kayit.date.startsWith(`${yil}-`) || !/^\d{4}-\d{2}-\d{2}$/.test(kayit.date)) continue;
    const ad = kayit.localName.toLocaleLowerCase("tr");
    const bayram: Bayram | null = ad.includes("ramazan") ? "ramazan" : ad.includes("kurban") ? "kurban" : null;
    if (!bayram) continue;
    sonuc.push({ bayram, tarih: kayit.date, ad: "" });
  }
  // Gün numarası sıraya göre yeniden verilir (kaynaktaki metne güvenilmez).
  for (const bayram of ["ramazan", "kurban"] as const) {
    const gunler = sonuc.filter((o) => o.bayram === bayram).sort((a, b) => a.tarih.localeCompare(b.tarih));
    gunler.forEach((o, i) => (o.ad = `${BAYRAM_ADLARI[bayram]} (${i + 1}. gün)`));
  }
  return sonuc.sort((a, b) => a.tarih.localeCompare(b.tarih));
}

/** Bir tatil adının hangi dini bayrama ait olduğu (onaylı kayıt var mı kontrolü için). */
export function tatilAdiBayrami(ad: string): Bayram | null {
  const kucuk = ad.toLocaleLowerCase("tr");
  if (kucuk.includes("ramazan bayram")) return "ramazan";
  if (kucuk.includes("kurban bayram")) return "kurban";
  return null;
}

export type BayramDurumu = "onayli" | "bekliyor" | "eksik";

/**
 * Bir yılın bayramı için durum: o yıl adı bayrama ait kesin bir tatil varsa "onayli",
 * yoksa bekleyen öneri varsa "bekliyor", hiçbiri yoksa "eksik" (tarih girilmemiş).
 */
export function bayramDurumu(
  bayram: Bayram,
  yil: number,
  tatiller: { tarih: string; ad: string }[],
  bekleyenOneriler: { bayram: string; yil: number }[]
): BayramDurumu {
  if (tatiller.some((t) => t.tarih.startsWith(`${yil}-`) && tatilAdiBayrami(t.ad) === bayram)) return "onayli";
  if (bekleyenOneriler.some((o) => o.bayram === bayram && o.yil === yil)) return "bekliyor";
  return "eksik";
}

/**
 * Hangi yıllar kontrol edilir: içinde bulunulan yıl her zaman; gelecek yıl Eylül'den itibaren
 * (Diyanet takvimi genelde yaz sonunda açıklanır, daha erken uyarı gürültü olurdu).
 */
export function kontrolEdilecekYillar(bugun: string): number[] {
  const [yil, ay] = bugun.split("-").map(Number);
  return ay >= 9 ? [yil, yil + 1] : [yil];
}

/** "2027-03-09" → "9 Mart 2027 Salı" (saat dilimi kaymasız; tarih zaten takvim günü). */
export function tatilTarihiGoster(tarih: string): string {
  const [y, a, g] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, a - 1, g, 12)).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    timeZone: "UTC",
  });
}

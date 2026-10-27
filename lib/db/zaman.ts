// Drizzle (mode: 'string') zaman damgalarını Postgres metin biçiminde verir: "2026-10-27 12:00:00.123+00". Tarayıcılar (özellikle Safari/iPad kiosk) boşluklu
// biçimi `new Date()` ile ayrıştıramaz ve eski PostgREST çıktısı ISO idi. İstemciye (RSC props / server action sonucu) giden veriler bu sınırdan geçirilir.
const ZAMAN = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})(?::?(\d{2}))?$/;

export function isoZaman(v: string): string {
  const m = ZAMAN.exec(v);
  if (!m) return v;
  return new Date(`${m[1]}T${m[2]}${m[3]}:${m[4] ?? "00"}`).toISOString();
}

/** Nesne/dizi ağacındaki zaman damgası metinlerini ISO 8601'e çevirir (tarih-yalnız `date` değerlerine dokunmaz). */
export function zamanlariIsoyaCevir<T>(deger: T): T {
  if (typeof deger === "string") return isoZaman(deger) as unknown as T;
  if (Array.isArray(deger)) return deger.map(zamanlariIsoyaCevir) as unknown as T;
  if (deger && typeof deger === "object" && Object.getPrototypeOf(deger) === Object.prototype) {
    return Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, zamanlariIsoyaCevir(v)])) as T;
  }
  return deger;
}

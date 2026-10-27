// Canlı olay sözleşmesi (LISTEN/NOTIFY → SSE). NOTIFY yükü YALNIZ {t, i, k} (tablo, satır id, klinik id) taşır — hasta/sağlık verisi yok.
// İstemciye giden SSE verisi daha da dar: {t, i} (klinik kimliği istemciye gönderilmez; süzme sunucuda yapılır).
// Yeni tablo eklerken: db/migrations/0008_canli_olaylar.sql'deki tetikleyici + aşağıdaki liste BİRLİKTE değişir.
export const CANLI_KANALI = "canli";
export const CANLI_TABLOLAR = ["randevu", "randevu_talebi", "randevu_iptal_talebi"] as const;
export type CanliTablo = (typeof CANLI_TABLOLAR)[number];

/** Dinleyicinin içinde dolaşan olay (klinik kimliği dahil). */
export type CanliOlay = { tablo: CanliTablo; id: string; klinikId: string };
/** İstemciye giden olay: klinik kimliği YOK. */
export type IstemciOlayi = { t: CanliTablo; i: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IZINLI_TABLOLAR: ReadonlySet<string> = new Set(CANLI_TABLOLAR);

/** NOTIFY yükünü doğrular: tam olarak {t,i,k} anahtarları, izinli tablo, uuid'ler. Aksi hâlde null (olay yok sayılır). */
export function olayCoz(ham: string | undefined): CanliOlay | null {
  if (!ham || ham.length > 300) return null;
  let o: unknown;
  try {
    o = JSON.parse(ham);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const anahtarlar = Object.keys(o).sort().join(",");
  if (anahtarlar !== "i,k,t") return null; // beklenmeyen alan = sözleşme ihlali (veri sızıntısı riski) → at
  const { t, i, k } = o as Record<string, unknown>;
  if (typeof t !== "string" || !IZINLI_TABLOLAR.has(t) || typeof i !== "string" || !UUID.test(i) || typeof k !== "string" || !UUID.test(k)) return null;
  return { tablo: t as CanliTablo, id: i, klinikId: k };
}

/** `?t=randevu,randevu_talebi` → izinli tablolar kümesi; bilinmeyen tablo ya da boş liste → null (400). Parametre yalnız TABLO seçer, klinik seçemez. */
export function tabloListesiCoz(param: string | null): Set<CanliTablo> | null {
  if (!param) return null;
  const parcalar = param.split(",").map((p) => p.trim()).filter(Boolean);
  if (parcalar.length === 0 || parcalar.length > CANLI_TABLOLAR.length) return null;
  const kume = new Set<CanliTablo>();
  for (const p of parcalar) {
    if (!IZINLI_TABLOLAR.has(p)) return null;
    kume.add(p as CanliTablo);
  }
  return kume;
}

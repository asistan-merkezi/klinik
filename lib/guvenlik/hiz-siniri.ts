// Hız sınırı: Postgres sayacı (hiz_siniri_kullan, tenant'sız global fonksiyon). GİRİŞ VE ANONİM UÇLARDA FAIL-CLOSED:
// sayaç okunamaz/yazılamazsa istek REDDEDİLİR (eski lib/qr/hiz-siniri.ts fail-open idi). Anahtarlar hash'li saklanır (KVKK).
import { createHash } from "node:crypto";
import { withGlobal, sql } from "@/lib/db";

/**
 * Sınır AŞIMI olayı (tek JSON satırı): uç adı + kimliğin KISALTILMIŞ hash'i + zaman. Ham kullanıcı kimliği/IP, belirteç, parola veya kişisel veri YAZILMAZ
 * (anahtarlar zaten sha256 özetidir; yine de son parça 8 karaktere kısaltılır). console.warn, instrumentation.ts'teki günlük hijyeni sarmalayıcısından geçer.
 */
export function hizSiniriAsimiLogla(anahtar: string): void {
  const p = anahtar.split(":");
  const kisa = (p.length > 1 ? p[p.length - 1] : "").slice(0, 8);
  const uc = p.slice(0, -1).join(":") || anahtar.slice(0, 24);
  console.warn(JSON.stringify({ olay: "hiz_siniri_asildi", uc: uc.slice(0, 40), kimlik_hash: kisa, zaman: new Date().toISOString() }));
}

export type HizSiniriKurali = { anahtar: string; limit: number; pencereSn: number };

export class HizSiniriHatasi extends Error {
  constructor(public readonly neden: "asildi" | "kullanilamiyor") {
    super(neden === "asildi" ? "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin." : "İşlem şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin.");
    this.name = "HizSiniriHatasi";
  }
}

/** Anahtara kimlik girdisini düz yazmadan ekler: ön ek + kısa SHA-256. */
export function hizAnahtari(onEk: string, kimlik: string): string {
  return `${onEk}:${createHash("sha256").update(kimlik.trim().toLowerCase()).digest("hex").slice(0, 24)}`;
}

/**
 * İstemci IP'sinden kısa hash. GÜVENİLEN TEK başlık `x-real-ip`'tir (Caddy her istekte gerçek bağlantı adresiyle EZER: deploy/windows/Caddyfile `istemci_ip`).
 * X-Forwarded-For istemci tarafından sahtelenebilir → ASLA kullanılmaz (eskiden "son çare" idi); başlık yoksa tek ortak "bilinmiyor" kovası kullanılır
 * (sahte başlıkla kova değiştirerek limit atlatılamaz).
 */
export function istemciImzasi(basliklar: Headers): string {
  const ham = basliklar.get("x-real-ip")?.trim() || "bilinmiyor";
  return createHash("sha256").update(ham).digest("hex").slice(0, 16);
}

async function sayac(kural: HizSiniriKurali, artir: boolean): Promise<boolean> {
  const sonuc = await withGlobal((tx) =>
    tx.execute(sql`select hiz_siniri_kullan(${kural.anahtar}, ${kural.limit}, ${kural.pencereSn}, ${artir}) as izin`)
  );
  const satir = sonuc.rows[0] as { izin: boolean } | undefined;
  if (!satir || typeof satir.izin !== "boolean") throw new Error("hiz_siniri_kullan beklenmeyen sonuç");
  return satir.izin;
}

/** Sayaç ARTIRMADAN sınır doldu mu bakar. Okunamazsa FAIL-CLOSED: HizSiniriHatasi('kullanilamiyor'). */
export async function hizSiniriKontrol(kurallar: HizSiniriKurali[]): Promise<void> {
  try {
    for (const k of kurallar) if (!(await sayac(k, false))) { hizSiniriAsimiLogla(k.anahtar); throw new HizSiniriHatasi("asildi"); }
  } catch (e) {
    if (e instanceof HizSiniriHatasi) throw e;
    throw new HizSiniriHatasi("kullanilamiyor");
  }
}

/** Sayacı artırır (başarısız deneme / her istek). Yazılamazsa FAIL-CLOSED. Sınır aşıldıysa 'asildi'. */
export async function hizSiniriKaydet(kurallar: HizSiniriKurali[]): Promise<void> {
  try {
    let asildi = false;
    for (const k of kurallar) if (!(await sayac(k, true))) { asildi = true; hizSiniriAsimiLogla(k.anahtar); }
    if (asildi) throw new HizSiniriHatasi("asildi");
  } catch (e) {
    if (e instanceof HizSiniriHatasi) throw e;
    throw new HizSiniriHatasi("kullanilamiyor");
  }
}

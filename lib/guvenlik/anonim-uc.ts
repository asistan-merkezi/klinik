// Anonim (giriş öncesi) yazma uçları için tek kapı: QR ön kayıt, anket, iş başvurusu.
//   1) Hız sınırı (IP + kısa kod) — FAIL-CLOSED: sayaç yazılamazsa istek reddedilir.
//   2) Kısa kod -> klinik (tanima şeması). Klinik kimliği ASLA istemciden (form alanı) alınmaz; yalnız kısa koddan çözülür.
//   3) QR/form o klinikte açık mı (qr_kodu_aktif_mi; DB politikası da aynı kontrolü zorlar).
//   4) İş, SET LOCAL ROLE klinik_anonim + app.tenant_id = çözülen klinik ile çalışır. Politikalar (0005) satırın klinik_id'sinin bu bağlamla
//      eşleşmesini ve QR'ın açık olmasını DB düzeyinde de zorlar: başka kliniğin UUID'siyle kayıt eklenemez.
import { klinikCozumle } from "@/lib/auth/giris";
import { withAnonim, sql, type Tx } from "@/lib/db";
import { HizSiniriHatasi, hizAnahtari, hizSiniriKaydet, istemciImzasi } from "./hiz-siniri";

export type AnonimUcSonucu<T> =
  | { ok: true; sonuc: T }
  | { ok: false; kod: "hiz" | "kullanilamiyor" | "klinik_yok" | "kapali"; mesaj: string };

export type AnonimUcSecenekleri = {
  /** Sayaç ön eki, ör. "qr_kayit", "anket", "is_basvuru". */
  ucAdi: string;
  kisaKod: string;
  basliklar: Headers;
  /** qr_kodu_aktif_mi tipi (hasta_on_kayit, anket, ...). İş başvurusu gibi QR'sız uçlarda boş bırakılır. */
  qrTipi?: string;
  /** IP başına pencere başına en fazla istek (varsayılan 10 / 10 dk). */
  ipLimiti?: number;
  pencereSn?: number;
};

export async function anonimUcCalistir<T>(s: AnonimUcSecenekleri, is: (tx: Tx, klinik: { id: string; ad: string }) => Promise<T>): Promise<AnonimUcSonucu<T>> {
  const pencere = s.pencereSn ?? 10 * 60;
  try {
    await hizSiniriKaydet([
      { anahtar: `${s.ucAdi}:ip:${istemciImzasi(s.basliklar)}`, limit: s.ipLimiti ?? 10, pencereSn: pencere },
      { anahtar: hizAnahtari(`${s.ucAdi}:kod`, s.kisaKod), limit: 120, pencereSn: 60 },
    ]);
  } catch (e) {
    if (e instanceof HizSiniriHatasi && e.neden === "asildi") return { ok: false, kod: "hiz", mesaj: e.message };
    return { ok: false, kod: "kullanilamiyor", mesaj: "İşlem şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin." }; // FAIL-CLOSED
  }
  let klinik: { id: string; ad: string } | null;
  try {
    klinik = await klinikCozumle(s.kisaKod);
  } catch {
    return { ok: false, kod: "kullanilamiyor", mesaj: "İşlem şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin." };
  }
  if (!klinik) return { ok: false, kod: "klinik_yok", mesaj: "Bu bağlantı geçerli değil." };
  const k = klinik;
  return withAnonim({ tenantId: k.id }, async (tx) => {
    if (s.qrTipi) {
      const r = await tx.execute(sql`select qr_kodu_aktif_mi(${k.id}::uuid, ${s.qrTipi}) as aktif`);
      if ((r.rows[0] as { aktif: boolean } | undefined)?.aktif !== true) return { ok: false as const, kod: "kapali" as const, mesaj: "Bu form şu anda kapalı." };
    }
    return { ok: true as const, sonuc: await is(tx, k) };
  });
}

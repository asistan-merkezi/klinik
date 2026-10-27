// Anonim (giriş öncesi) yazma uçları için tek kapı: QR ön kayıt, anket, iş başvurusu.
//   1) Hız sınırı (IP + kısa kod) — FAIL-CLOSED: sayaç yazılamazsa istek reddedilir.
//   2) Kısa kod -> klinik (tanima şeması). Klinik kimliği ASLA istemciden (form alanı) alınmaz; yalnız kısa koddan çözülür.
//   3) QR/form o klinikte açık mı (qr_kodu_aktif_mi; DB politikası da aynı kontrolü zorlar).
//   4) İş, SET LOCAL ROLE klinik_anonim + app.tenant_id = çözülen klinik ile çalışır. Politikalar (0005) satırın klinik_id'sinin bu bağlamla
//      eşleşmesini ve QR'ın açık olmasını DB düzeyinde de zorlar: başka kliniğin UUID'siyle kayıt eklenemez.
import { klinikCozumle } from "@/lib/auth/giris";
import { withAnonim, withTanima, rpc, sql, type Tx } from "@/lib/db";
import { anonimBaglamUret } from "@/lib/db/baglam-uretici";
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
  /** Kısa kod (klinik) başına GÜNLÜK toplam tavan (sahte kayıtla DB şişirmeye karşı); verilmezse yalnız dakikalık kod sınırı uygulanır. */
  kodGunlukLimiti?: number;
};

export async function anonimUcCalistir<T>(s: AnonimUcSecenekleri, is: (tx: Tx, klinik: { id: string; ad: string }) => Promise<T>): Promise<AnonimUcSonucu<T>> {
  const pencere = s.pencereSn ?? 10 * 60;
  try {
    await hizSiniriKaydet([
      { anahtar: `${s.ucAdi}:ip:${istemciImzasi(s.basliklar)}`, limit: s.ipLimiti ?? 10, pencereSn: pencere },
      { anahtar: hizAnahtari(`${s.ucAdi}:kod`, s.kisaKod), limit: 120, pencereSn: 60 },
      ...(s.kodGunlukLimiti ? [{ anahtar: hizAnahtari(`${s.ucAdi}:kodgun`, s.kisaKod), limit: s.kodGunlukLimiti, pencereSn: 86400 }] : []),
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
  return withAnonim(anonimBaglamUret(k.id), async (tx) => {
    if (s.qrTipi) {
      const r = await tx.execute(sql`select qr_kodu_aktif_mi(${k.id}::uuid, ${s.qrTipi}) as aktif`);
      if ((r.rows[0] as { aktif: boolean } | undefined)?.aktif !== true) return { ok: false as const, kod: "kapali" as const, mesaj: "Bu form şu anda kapalı." };
    }
    return { ok: true as const, sonuc: await is(tx, k) };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KULLANILAMIYOR = "İşlem şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin.";

/** QR kısa kodundan klinik (tenant'sız tanima çözümü; sayfa render'ı için). Hata/geçersiz kodda null. */
export async function klinikQrBilgisi(kisaKod: string): Promise<{ id: string; ad: string } | null> {
  try {
    return await klinikCozumle(kisaKod);
  } catch {
    return null;
  }
}

/** Bu klinikte bu QR/form açık mı? FAIL-CLOSED: okunamazsa false (eskiden hata durumunda AÇIK sayılırdı). */
export async function qrAktifMi(klinikId: string, tip: string): Promise<boolean> {
  if (!UUID.test(klinikId)) return false;
  try {
    return await withAnonim(anonimBaglamUret(klinikId), async (tx) => {
      const r = await tx.execute(sql`select qr_kodu_aktif_mi(${klinikId}::uuid, ${tip}) as aktif`);
      return (r.rows[0] as { aktif: boolean } | undefined)?.aktif === true;
    });
  } catch {
    return false;
  }
}

/** Seans anketi sayfası: randevu kimliğinden klinik adı + zaten dolduruldu mu. Bilinmeyen randevu / hata → null. */
export async function seansAnketBaglamiGetir(randevuId: string): Promise<{ klinikAd: string; zatenDolduruldu: boolean } | null> {
  if (!UUID.test(randevuId)) return null;
  try {
    const klinikId = await randevuKlinigi(randevuId);
    if (!klinikId) return null;
    return await withAnonim(anonimBaglamUret(klinikId), async (tx) => {
      const s = (await rpc<{ klinik_ad: string; zaten_dolduruldu: boolean }>(tx, "seans_degerlendirme_baglam_getir", { p_randevu_id: randevuId }))[0];
      return s ? { klinikAd: s.klinik_ad, zatenDolduruldu: s.zaten_dolduruldu } : null;
    });
  } catch {
    return null;
  }
}

async function randevuKlinigi(randevuId: string): Promise<string | null> {
  const r = await withTanima((tx) => tx.execute(sql`select tanima.randevu_klinik_cozumle(${randevuId}::uuid) as klinik_id`));
  return (r.rows[0] as { klinik_id: string | null } | undefined)?.klinik_id ?? null;
}

/**
 * Randevu kimliği ile gelen anonim uçlar (seans anketi): klinik kimliği ASLA formdan alınmaz; randevu id'sinden tanima ile çözülür.
 * Hız sınırı (IP + randevu) FAIL-CLOSED; yazma `klinik_anonim` rolü + çözülen tenant ile yapılır, DB politikaları (randevu_anket_uygun_mu) ayrıca zorlar.
 */
export async function anonimRandevuUcCalistir<T>(
  s: { ucAdi: string; randevuId: string; basliklar: Headers; ipLimiti?: number },
  is: (tx: Tx, klinikId: string) => Promise<T>
): Promise<AnonimUcSonucu<T>> {
  if (!UUID.test(s.randevuId)) return { ok: false, kod: "klinik_yok", mesaj: "Bu bağlantı geçerli değil." };
  try {
    await hizSiniriKaydet([
      { anahtar: `${s.ucAdi}:ip:${istemciImzasi(s.basliklar)}`, limit: s.ipLimiti ?? 10, pencereSn: 600 },
      { anahtar: hizAnahtari(`${s.ucAdi}:randevu`, s.randevuId), limit: 20, pencereSn: 600 },
    ]);
  } catch (e) {
    if (e instanceof HizSiniriHatasi && e.neden === "asildi") return { ok: false, kod: "hiz", mesaj: e.message };
    return { ok: false, kod: "kullanilamiyor", mesaj: KULLANILAMIYOR }; // FAIL-CLOSED
  }
  let klinikId: string | null;
  try {
    klinikId = await randevuKlinigi(s.randevuId);
  } catch {
    return { ok: false, kod: "kullanilamiyor", mesaj: KULLANILAMIYOR };
  }
  if (!klinikId) return { ok: false, kod: "klinik_yok", mesaj: "Bu bağlantı geçerli değil." };
  const k = klinikId;
  return withAnonim(anonimBaglamUret(k), async (tx) => ({ ok: true as const, sonuc: await is(tx, k) }));
}

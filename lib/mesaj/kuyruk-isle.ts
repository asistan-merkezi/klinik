// Mesaj kuyruğu işçisi (scripts/bakim/mesaj-kuyruk-isle). Üç ayrı adım, HTTP çağrısı hiçbir DB transaction'ının içinde YAPILMAZ:
//   1) kuyrukSatirlariniAl  — klinik başına kısa transaction: takılı satırları kurtar, kota içinde kalan satırları ATOMİK olarak 'gonderiliyor'a al
//   2) satiriGonder         — transaction DIŞINDA: e-posta Resend'e, SMS/WhatsApp merkeze (kredi kontrolü merkezde)
//   3) sonucuKaydet         — klinik başına kısa transaction: durumu yaz, merkezin bakiyesini yerel yansımaya senkronla
// Tenant sınırı: her adım tek bir kliniğin tenant bağlamında çalışır (RLS), bir klinik başka kliniğin satırına dokunamaz.
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { rpc, sema, type Tx } from "@/lib/db";
import { merkezeGonder } from "./merkez-client";
import { hataDegerlendir } from "./hata-kodlari";
import { resendIleGonder } from "./eposta-resend";
import { EPOSTA_KONUSU, sablonuDogrula } from "./icerik";
import type { MesajKanal, MesajKuyrukDurum } from "@/types/mesajlasma";

/** Geçici hata backoff'u: 1. deneme sonrası 5dk, 2. sonrası 30dk, 3. deneme de başarısızsa durum='hata'. */
export const GERI_CEKILME_DAKIKA = [5, 30, 120];
const MAKS_DENEME = GERI_CEKILME_DAKIKA.length;
/** Bu süreden uzun 'gonderiliyor'da kalan satır, çöken bir işlemden kalmıştır. */
export const TAKILI_SATIR_DK = 10;
/** HIZ SINIRI: bir klinik son 60 dakikada en fazla bu kadar mesaj gönderebilir (kredisi olsa bile); aşırı tüketimi/hatalı döngüyü sınırlar. */
export const SAATLIK_KLINIK_LIMITI = 300;
export const TUR_BASINA_KLINIK_LIMITI = 25;

export type KuyrukSatiri = {
  id: string;
  klinikId: string;
  kanal: MesajKanal;
  aliciAdres: string;
  metin: string;
  tetikleyiciKodu: string;
  testMi: boolean;
  denemeSayisi: number;
  idempotencyAnahtari: string;
};

type Bakiye = { kalan: number; versiyon: number };
export type GonderSonucu =
  | { tur: "gonderildi"; saglayiciMesajId?: string; bakiye?: Bakiye }
  | { tur: "kalici"; durum: MesajKuyrukDurum; hata: string; bakiye?: Bakiye }
  | { tur: "gecici"; hata: string };

/** Saf: bu turda alınabilecek satır sayısı (saatlik kota ve tur sınırı). */
export function alinabilirSatirSayisi(sonSaattekiGonderim: number, saatlikLimit = SAATLIK_KLINIK_LIMITI, turLimiti = TUR_BASINA_KLINIK_LIMITI): number {
  return Math.max(0, Math.min(turLimiti, saatlikLimit - sonSaattekiGonderim));
}

/** Saf: geçici hata sonrası sıradaki durum. */
export function geciciHataSonrasi(denemeSayisi: number, simdi: Date): { durum: "beklemede" | "hata"; denemeSayisi: number; planlananZaman?: Date } {
  const yeni = denemeSayisi + 1;
  if (yeni >= MAKS_DENEME) return { durum: "hata", denemeSayisi: yeni };
  return { durum: "beklemede", denemeSayisi: yeni, planlananZaman: new Date(simdi.getTime() + GERI_CEKILME_DAKIKA[yeni - 1] * 60_000) };
}

const K = sema.mesajKuyrugu;

/** Adım 1. `tx`: o kliniğin sistem bağlamı (bakimOturumuAc().klinikte). */
export async function kuyrukSatirlariniAl(tx: Tx, klinikId: string, simdi = new Date()): Promise<KuyrukSatiri[]> {
  const esik = new Date(simdi.getTime() - TAKILI_SATIR_DK * 60_000).toISOString();
  await tx
    .update(K)
    .set({ durum: "beklemede", hataMesaji: "işlem yarıda kaldı, yeniden denenecek" })
    .where(and(eq(K.klinikId, klinikId), eq(K.durum, "gonderiliyor"), or(isNull(K.islemeAlinmaZamani), lt(K.islemeAlinmaZamani, esik))));

  const saatOnce = new Date(simdi.getTime() - 3_600_000).toISOString();
  const [{ adet }] = await tx
    .select({ adet: sql<number>`count(*)::int` })
    .from(K)
    .where(and(eq(K.klinikId, klinikId), eq(K.testMi, false), or(and(eq(K.durum, "gonderildi"), gte(K.gonderimZamani, saatOnce)), eq(K.durum, "gonderiliyor"))));
  const limit = alinabilirSatirSayisi(adet);
  if (limit === 0) return [];

  const adaylar = await tx
    .select({ id: K.id })
    .from(K)
    .where(and(eq(K.klinikId, klinikId), eq(K.durum, "beklemede"), lte(K.planlananZaman, simdi.toISOString())))
    .orderBy(asc(K.planlananZaman))
    .limit(limit);
  if (adaylar.length === 0) return [];

  // Atomik claim: yalnız hâlâ 'beklemede' olan satır 'gonderiliyor'a geçer; eşzamanlı iki işçi aynı satırı iki kez alamaz.
  const alinan = await tx
    .update(K)
    .set({ durum: "gonderiliyor", islemeAlinmaZamani: simdi.toISOString() })
    .where(and(eq(K.klinikId, klinikId), eq(K.durum, "beklemede"), inArray(K.id, adaylar.map((a) => a.id))))
    .returning({
      id: K.id,
      klinikId: K.klinikId,
      kanal: K.kanal,
      aliciAdres: K.aliciAdres,
      metin: K.gonderilecekMetin,
      tetikleyiciKodu: K.tetikleyiciKodu,
      testMi: K.testMi,
      denemeSayisi: K.denemeSayisi,
      idempotencyAnahtari: K.idempotencyAnahtari,
    });
  return alinan as KuyrukSatiri[];
}

/** Adım 2. DB bağlantısı KULLANMAZ. */
export async function satiriGonder(satir: KuyrukSatiri): Promise<GonderSonucu> {
  // Göndermeden hemen önce son KVKK doğrulaması: kuyruğa başka yoldan giren kişisel veri desenli metin dışarı çıkmaz.
  // Kuyruk metni doldurulmuş olduğundan {{...}} kalmamalı; desen taraması yeterlidir.
  // Bağlantı (rastgele token) desen taramasından ÇIKARILIR: ardışık rakamlar telefon/kimlik desenine yanlış eşleşirdi.
  const kontrol = sablonuDogrula(satir.metin.replace(/https?:\/\/\S+/g, ""));
  if (!kontrol.gecerli) return { tur: "kalici", durum: "iptal", hata: "icerik_kurali_ihlali" };

  if (satir.kanal === "mail") {
    const s = await resendIleGonder({ alici: satir.aliciAdres, konu: EPOSTA_KONUSU, metin: satir.metin, idempotencyKey: satir.idempotencyAnahtari });
    if (s.ok) return { tur: "gonderildi", saglayiciMesajId: s.saglayiciId || undefined };
    return s.kalici ? { tur: "kalici", durum: "hata", hata: s.hata } : { tur: "gecici", hata: s.hata };
  }

  const sonuc = await merkezeGonder({
    klinikId: satir.klinikId,
    kanal: satir.kanal,
    aliciAdres: satir.aliciAdres,
    metin: satir.metin,
    idempotencyKey: satir.idempotencyAnahtari,
    testMi: satir.testMi,
    tetikleyiciKodu: satir.tetikleyiciKodu,
  });
  if (!sonuc.ulasildi) return { tur: "gecici", hata: sonuc.hata };
  const bakiye = { kalan: sonuc.kalanBakiye, versiyon: sonuc.bakiyeVersiyonu };
  if (sonuc.basarili) return { tur: "gonderildi", saglayiciMesajId: sonuc.saglayiciMesajId, bakiye };
  const { kalici, kaliciDurum } = hataDegerlendir(sonuc.hata);
  return kalici ? { tur: "kalici", durum: kaliciDurum, hata: sonuc.hata, bakiye } : { tur: "gecici", hata: sonuc.hata };
}

/** Adım 3. */
export async function sonucuKaydet(tx: Tx, satir: KuyrukSatiri, sonuc: GonderSonucu, simdi = new Date()): Promise<MesajKuyrukDurum> {
  const where = and(eq(K.id, satir.id), eq(K.klinikId, satir.klinikId), eq(K.durum, "gonderiliyor"));
  if (sonuc.tur !== "gecici" && sonuc.bakiye) {
    // Merkez yanıt verdiyse kalan bakiye her zaman güvenilirdir; versiyon guard'ı RPC içinde (eski yanıt yeniyi ezmez).
    await rpc(tx, "mesaj_kredi_senkronla", { p_klinik_id: satir.klinikId, p_kanal: satir.kanal, p_bakiye: sonuc.bakiye.kalan, p_versiyon: sonuc.bakiye.versiyon });
  }
  if (sonuc.tur === "gonderildi") {
    await tx.update(K).set({ durum: "gonderildi", gonderimZamani: simdi.toISOString(), saglayiciMesajId: sonuc.saglayiciMesajId ?? null }).where(where);
    return "gonderildi";
  }
  if (sonuc.tur === "kalici") {
    await tx.update(K).set({ durum: sonuc.durum, hataMesaji: sonuc.hata }).where(where);
    return sonuc.durum;
  }
  const sonraki = geciciHataSonrasi(satir.denemeSayisi, simdi);
  await tx
    .update(K)
    .set({ durum: sonraki.durum, hataMesaji: sonuc.hata, denemeSayisi: sonraki.denemeSayisi, ...(sonraki.planlananZaman ? { planlananZaman: sonraki.planlananZaman.toISOString() } : {}) })
    .where(where);
  return sonraki.durum;
}

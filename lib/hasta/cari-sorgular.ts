// Hasta Detayı > Cari & Ödeme sekmesinin okuma sorguları (Drizzle). PostgREST iç içe embed'lerinin birebir karşılığıdır; şekil
// `types/hasta-detay.ts > HastaBakiyeHareket` ve `types/odeme.ts > PaketSatisSatir`. numeric kolonlar sayıya çevrilir.
import { desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { sema, zamanlariIsoyaCevir, type Tx } from "@/lib/db";
import type { HastaBakiyeHareket, HastaBakiyeHareketOdemeKalemi, BakiyeHareketTuru } from "@/types/hasta-detay";
import type { PaketSatisSatir, OdemeYontemi } from "@/types/odeme";
import type { IskontoOranlariYuzde } from "@/lib/fiyat/etkin-fiyat-hesapla";

const sayi = (v: string | number | null | undefined) => Number(v ?? 0);

export async function aktifPaketSatislariGetir(tx: Tx, hastaId: string): Promise<PaketSatisSatir[]> {
  const s = await tx
    .select({ id: sema.paketSatis.id, kalan: sema.paketSatis.kalanAdet, durum: sema.paketSatis.durum, satisTarihi: sema.paketSatis.satisTarihi, paketAd: sema.paket.ad, seansSayisi: sema.paket.seansSayisi })
    .from(sema.paketSatis)
    .leftJoin(sema.paket, eq(sema.paket.id, sema.paketSatis.paketId))
    .where(eq(sema.paketSatis.hastaId, hastaId))
    .orderBy(sema.paketSatis.satisTarihi);
  return s.filter((x) => x.durum === "aktif").map((x) => ({
    id: x.id,
    kalan_adet: x.kalan,
    durum: x.durum,
    satis_tarihi: x.satisTarihi,
    paket: x.paketAd == null ? null : { ad: x.paketAd, seans_sayisi: x.seansSayisi ?? 0 },
  }));
}

export async function iskontoOranlariGetir(tx: Tx): Promise<IskontoOranlariYuzde | null> {
  const s = (await tx.select({ plus: sema.iskontoOranlari.plusPct, elit: sema.iskontoOranlari.elitPct, prime: sema.iskontoOranlari.primePct }).from(sema.iskontoOranlari).limit(1))[0];
  return s ? { plus_pct: sayi(s.plus), elit_pct: sayi(s.elit), prime_pct: sayi(s.prime) } : null;
}

export async function hastaBakiyesiGetir(tx: Tx, hastaId: string): Promise<number> {
  const s = (await tx.select({ bakiye: sema.vHastaOzet.bakiye }).from(sema.vHastaOzet).where(eq(sema.vHastaOzet.hastaId, hastaId)).limit(1))[0];
  return sayi(s?.bakiye);
}

/** En yeni ilk, `limit` kadar hareket; randevu/ödeme ayrıntıları iç içe (eski select ile aynı şekil). */
export async function bakiyeHareketleriGetir(tx: Tx, hastaId: string, limit = 30): Promise<HastaBakiyeHareket[]> {
  const terapistPersonel = alias(sema.personel, "terapist_personel");
  const uygulayan = alias(sema.kullanici, "iskonto_uygulayan");
  const satirlar = await tx
    .select({
      h: sema.hastaBakiyeHareket,
      terapistAd: terapistPersonel.adSoyad,
      rIslemAd: sema.islemTanimi.ad,
      rIslemFiyat: sema.islemTanimi.vitaFiyat,
      rVar: sema.randevu.id,
      uygulayanAd: uygulayan.adSoyad,
      odemeIskonto: sema.odeme.iskontoTutari,
      odemeVar: sema.odeme.id,
    })
    .from(sema.hastaBakiyeHareket)
    .leftJoin(sema.randevu, eq(sema.randevu.id, sema.hastaBakiyeHareket.randevuId))
    .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
    .leftJoin(terapistPersonel, eq(terapistPersonel.id, sema.terapist.personelId))
    .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevu.islemTanimiId))
    .leftJoin(uygulayan, eq(uygulayan.id, sema.hastaBakiyeHareket.iskontoUygulayanKullaniciId))
    .leftJoin(sema.odeme, eq(sema.odeme.id, sema.hastaBakiyeHareket.odemeId))
    .where(eq(sema.hastaBakiyeHareket.hastaId, hastaId))
    .orderBy(desc(sema.hastaBakiyeHareket.createdAt))
    .limit(limit);

  const odemeIdler = [...new Set(satirlar.map((s) => s.odemeVar).filter((x): x is string => Boolean(x)))];
  const kalemler = odemeIdler.length
    ? await tx
        .select({
          odemeId: sema.odemeKalemi.odemeId,
          miktar: sema.odemeKalemi.miktar,
          birimFiyat: sema.odemeKalemi.birimFiyat,
          islemAd: sema.islemTanimi.ad,
          islemFiyat: sema.islemTanimi.vitaFiyat,
          paketAd: sema.paket.ad,
        })
        .from(sema.odemeKalemi)
        .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.odemeKalemi.islemTanimiId))
        .leftJoin(sema.paketSatis, eq(sema.paketSatis.id, sema.odemeKalemi.paketSatisId))
        .leftJoin(sema.paket, eq(sema.paket.id, sema.paketSatis.paketId))
        .where(inArray(sema.odemeKalemi.odemeId, odemeIdler))
    : [];
  const satirYontemleri = odemeIdler.length
    ? await tx.select({ odemeId: sema.odemeSatiri.odemeId, yontem: sema.odemeSatiri.yontem }).from(sema.odemeSatiri).where(inArray(sema.odemeSatiri.odemeId, odemeIdler))
    : [];

  return zamanlariIsoyaCevir(
    satirlar.map(({ h, ...e }): HastaBakiyeHareket => ({
      id: h.id,
      tur: h.tur as BakiyeHareketTuru,
      tutar: sayi(h.tutar),
      iskonto_tutari: sayi(h.iskontoTutari),
      aciklama: h.aciklama,
      created_at: h.createdAt,
      odeme_id: h.odemeId,
      randevu: e.rVar ? { terapist: e.terapistAd == null ? null : { personel: { ad_soyad: e.terapistAd } }, islem_tanimi: e.rIslemAd == null ? null : { ad: e.rIslemAd, vita_fiyat: sayi(e.rIslemFiyat) } } : null,
      odeme: e.odemeVar
        ? {
            iskonto_tutari: sayi(e.odemeIskonto),
            odeme_kalemi: kalemler
              .filter((k) => k.odemeId === e.odemeVar)
              .map((k): HastaBakiyeHareketOdemeKalemi => ({
                miktar: k.miktar,
                birim_fiyat: sayi(k.birimFiyat),
                islem_tanimi: k.islemAd == null ? null : { ad: k.islemAd, vita_fiyat: sayi(k.islemFiyat) },
                paket_satis: k.paketAd == null ? null : { paket: { ad: k.paketAd } },
              })),
            odeme_satiri: satirYontemleri.filter((y) => y.odemeId === e.odemeVar).map((y) => ({ yontem: y.yontem as OdemeYontemi })),
          }
        : null,
      iskonto_uygulayan: e.uygulayanAd == null ? null : { ad_soyad: e.uygulayanAd },
    }))
  );
}

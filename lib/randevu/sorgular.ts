// Randevu ekranlarının ORTAK okuma sorguları (Drizzle; withTenant transaction'ı içinde çağrılır). Eski `RANDEVU_SELECT` (PostgREST embed) dizesinin
// karşılığıdır ve `types/randevu.ts > RandevuSatir` şeklini üretir — yeni kolon eklenirse ikisi birlikte değişir. Tek kaynak: panel, randevular,
// canlı çizelge yenilemesi hep `randevuSatirlariGetir`i kullanır (eskiden 3 kopya vardı, biri ayrışınca kolon sessizce kayboldu).
// Zaman damgaları ISO'ya ÇEVRİLMİŞ döner (istemciye giden veri sınırı).
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { sema, zamanlariIsoyaCevir, type Tx } from "@/lib/db";
import type { RandevuDurum, RandevuSatir, SecenekSatir } from "@/types/randevu";
import type { BekleyenIptalTalebiSatir, BekleyenRandevuTalebiSatir } from "@/types/portal";
import type { KlinikBankaHesabi } from "@/types/klinik";
import type { HaftaninGunu, PeriyodikRandevuSatir } from "@/types/periyodik-randevu";

type Aralik = { baslangic: string; bitis: string; odaId?: string };

/** [baslangic, bitis) aralığındaki randevular (başlangıca göre sıralı), RandevuSatir şeklinde. `odaId` verilirse yalnız o oda (tablet). */
export async function randevuSatirlariGetir(tx: Tx, a: Aralik): Promise<RandevuSatir[]> {
  const terapistPersonel = alias(sema.personel, "terapist_personel");
  const antrenor = alias(sema.personel, "antrenor");
  const tamamlayan = alias(sema.kullanici, "tamamlayan");
  const kosullar = [gte(sema.randevu.baslangic, a.baslangic), lt(sema.randevu.baslangic, a.bitis)];
  if (a.odaId) kosullar.push(eq(sema.randevu.odaId, a.odaId));

  const satirlar = await tx
    .select({
      r: sema.randevu,
      hastaAd: sema.hasta.adSoyad,
      odaAd: sema.oda.ad,
      terapistAd: terapistPersonel.adSoyad,
      islemId: sema.islemTanimi.id,
      islemAd: sema.islemTanimi.ad,
      antrenorAd: antrenor.adSoyad,
      protokolId: sema.tedaviProtokolu.id,
      protokolAd: sema.tedaviProtokolu.ad,
      tamamlayanAd: tamamlayan.adSoyad,
      paketKalan: sema.paketSatis.kalanAdet,
      paketAd: sema.paket.ad,
    })
    .from(sema.randevu)
    .leftJoin(sema.hasta, eq(sema.hasta.id, sema.randevu.hastaId))
    .leftJoin(sema.oda, eq(sema.oda.id, sema.randevu.odaId))
    .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
    .leftJoin(terapistPersonel, eq(terapistPersonel.id, sema.terapist.personelId))
    .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevu.islemTanimiId))
    .leftJoin(antrenor, eq(antrenor.id, sema.randevu.antrenorId))
    .leftJoin(sema.tedaviProtokolu, eq(sema.tedaviProtokolu.id, sema.randevu.tedaviProtokoluId))
    .leftJoin(tamamlayan, eq(tamamlayan.id, sema.randevu.tamamlayanKullaniciId))
    .leftJoin(sema.paketSatis, eq(sema.paketSatis.id, sema.randevu.paketSatisId))
    .leftJoin(sema.paket, eq(sema.paket.id, sema.paketSatis.paketId))
    .where(and(...kosullar))
    .orderBy(asc(sema.randevu.baslangic));

  const ids = satirlar.map((s) => s.r.id);
  const hareketler = ids.length
    ? await tx
        .select({ id: sema.hastaBakiyeHareket.id, tur: sema.hastaBakiyeHareket.tur, randevuId: sema.hastaBakiyeHareket.randevuId })
        .from(sema.hastaBakiyeHareket)
        .where(inArray(sema.hastaBakiyeHareket.randevuId, ids))
    : [];
  const hareketHaritasi = new Map<string, { id: string; tur: string }[]>();
  for (const h of hareketler) if (h.randevuId) hareketHaritasi.set(h.randevuId, [...(hareketHaritasi.get(h.randevuId) ?? []), { id: h.id, tur: h.tur }]);

  return zamanlariIsoyaCevir(
    satirlar.map(({ r, ...e }): RandevuSatir => ({
      id: r.id,
      baslangic: r.baslangic,
      bitis: r.bitis,
      durum: r.durum as RandevuDurum,
      gecikme_dakika: r.gecikmeDakika,
      hasta_id: r.hastaId,
      terapist_id: r.terapistId,
      oda_id: r.odaId,
      cihaz_id: r.cihazId,
      hasta: e.hastaAd == null ? null : { ad_soyad: e.hastaAd },
      oda: e.odaAd == null ? null : { ad: e.odaAd },
      terapist: e.terapistAd == null ? null : { personel: { ad_soyad: e.terapistAd } },
      islem_tanimi: e.islemId ? { id: e.islemId, ad: e.islemAd ?? "" } : null,
      tani: r.tani,
      antrenor_id: r.antrenorId,
      antrenor: e.antrenorAd == null ? null : { ad_soyad: e.antrenorAd },
      tedavi_protokolu_id: r.tedaviProtokoluId,
      tedavi_protokolu: e.protokolId ? { id: e.protokolId, ad: e.protokolAd ?? "" } : null,
      tamamlanma_aciklamasi: r.tamamlanmaAciklamasi,
      tamamlanma_tarihi: r.tamamlanmaTarihi,
      iptal_aciklamasi: r.iptalAciklamasi,
      iptal_tarihi: r.iptalTarihi,
      gec_iptal: r.gecIptal,
      iptal_paket_dusuldu: r.iptalPaketDusuldu,
      bedelli_iptal: r.bedelliIptal,
      iptal_borc_yazildi: r.iptalBorcYazildi,
      tamamlayan_kullanici: e.tamamlayanAd == null ? null : { ad_soyad: e.tamamlayanAd },
      paket_satis_id: r.paketSatisId,
      paket_satis: r.paketSatisId && e.paketKalan != null ? { kalan_adet: e.paketKalan, paket: e.paketAd == null ? null : { ad: e.paketAd } } : null,
      hasta_bakiye_hareket: hareketHaritasi.get(r.id) ?? [],
    }))
  );
}

/**
 * Oda tableti için DAR satır: yalnız tabletin gösterdiği alanlar (tanı, tamamlanma notu, ödeme/paket bilgisi gibi sağlık/finans verileri tablet
 * istemcisine HİÇ gönderilmez — kiosk ekranı herkesin görebildiği bir yerde). Eski tablet select'iyle aynı şekil.
 */
export async function tabletRandevulariGetir(tx: Tx, a: { baslangic: string; bitis: string; odaId: string }): Promise<RandevuSatir[]> {
  const terapistPersonel = alias(sema.personel, "terapist_personel");
  const s = await tx
    .select({
      id: sema.randevu.id,
      baslangic: sema.randevu.baslangic,
      bitis: sema.randevu.bitis,
      durum: sema.randevu.durum,
      hastaId: sema.randevu.hastaId,
      hastaAd: sema.hasta.adSoyad,
      odaAd: sema.oda.ad,
      terapistAd: terapistPersonel.adSoyad,
      islemId: sema.islemTanimi.id,
      islemAd: sema.islemTanimi.ad,
    })
    .from(sema.randevu)
    .leftJoin(sema.hasta, eq(sema.hasta.id, sema.randevu.hastaId))
    .leftJoin(sema.oda, eq(sema.oda.id, sema.randevu.odaId))
    .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
    .leftJoin(terapistPersonel, eq(terapistPersonel.id, sema.terapist.personelId))
    .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevu.islemTanimiId))
    .where(and(eq(sema.randevu.odaId, a.odaId), gte(sema.randevu.baslangic, a.baslangic), lt(sema.randevu.baslangic, a.bitis)))
    .orderBy(asc(sema.randevu.baslangic));
  return zamanlariIsoyaCevir(
    s.map((x): RandevuSatir => ({
      id: x.id,
      baslangic: x.baslangic,
      bitis: x.bitis,
      durum: x.durum as RandevuDurum,
      hasta_id: x.hastaId,
      hasta: x.hastaAd == null ? null : { ad_soyad: x.hastaAd },
      oda: x.odaAd == null ? null : { ad: x.odaAd },
      terapist: x.terapistAd == null ? null : { personel: { ad_soyad: x.terapistAd } },
      islem_tanimi: x.islemId ? { id: x.islemId, ad: x.islemAd ?? "" } : null,
    }))
  );
}

/** Oturumdaki terapist kullanıcının terapist.id'si (rol terapist değilse çağırma). Personel kaydı/terapist kaydı yoksa null. */
export async function kendiTerapistIdGetir(tx: Tx, kullaniciId: string): Promise<string | null> {
  const s = (
    await tx
      .select({ id: sema.terapist.id })
      .from(sema.personel)
      .innerJoin(sema.terapist, eq(sema.terapist.personelId, sema.personel.id))
      .where(eq(sema.personel.kullaniciId, kullaniciId))
      .limit(1)
  )[0];
  return s?.id ?? null;
}

export async function odaSecenekleriGetir(tx: Tx): Promise<SecenekSatir[]> {
  return tx.select({ id: sema.oda.id, ad: sema.oda.ad }).from(sema.oda).where(eq(sema.oda.aktif, true)).orderBy(asc(sema.oda.ad));
}
export async function cihazSecenekleriGetir(tx: Tx): Promise<SecenekSatir[]> {
  return tx.select({ id: sema.cihaz.id, ad: sema.cihaz.ad }).from(sema.cihaz).where(eq(sema.cihaz.aktif, true)).orderBy(asc(sema.cihaz.ad));
}
/** "Antrenör" seçici: aktif personel (eski sorgu: personel tablosu, aktif=true). */
export async function antrenorSecenekleriGetir(tx: Tx): Promise<SecenekSatir[]> {
  return tx.select({ id: sema.personel.id, ad: sema.personel.adSoyad }).from(sema.personel).where(eq(sema.personel.aktif, true)).orderBy(asc(sema.personel.adSoyad));
}
export async function protokolSecenekleriGetir(tx: Tx): Promise<SecenekSatir[]> {
  return tx.select({ id: sema.tedaviProtokolu.id, ad: sema.tedaviProtokolu.ad }).from(sema.tedaviProtokolu).where(eq(sema.tedaviProtokolu.aktif, true)).orderBy(asc(sema.tedaviProtokolu.ad));
}
export async function bankaHesaplariGetir(tx: Tx): Promise<KlinikBankaHesabi[]> {
  return tx
    .select({ id: sema.klinikBankaHesaplari.id, banka_adi: sema.klinikBankaHesaplari.bankaAdi, sube: sema.klinikBankaHesaplari.sube })
    .from(sema.klinikBankaHesaplari)
    .orderBy(asc(sema.klinikBankaHesaplari.sortOrder));
}
/** Tüm terapistler (çıkış tarihi süzülmeden; ana panelin "Terapist Durumları" kartı bunu kullanır — eski davranış). */
export async function tumTerapistSecenekleriGetir(tx: Tx) {
  const s = await tx
    .select({ id: sema.terapist.id, ad: sema.personel.adSoyad, pozisyon_id: sema.personel.pozisyonId })
    .from(sema.terapist)
    .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId));
  return s.map((t) => ({ id: t.id, ad: t.ad ?? "—", pozisyon_id: t.pozisyon_id ?? null })).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
}

export async function bekleyenIptalTalepleriGetir(tx: Tx): Promise<BekleyenIptalTalebiSatir[]> {
  const s = await tx
    .select({
      id: sema.randevuIptalTalebi.id,
      durum: sema.randevuIptalTalebi.durum,
      createdAt: sema.randevuIptalTalebi.createdAt,
      aciklama: sema.randevuIptalTalebi.aciklama,
      gecIptal: sema.randevuIptalTalebi.gecIptal,
      rId: sema.randevu.id,
      rBaslangic: sema.randevu.baslangic,
      rDurum: sema.randevu.durum,
      hastaAd: sema.hasta.adSoyad,
    })
    .from(sema.randevuIptalTalebi)
    .leftJoin(sema.randevu, eq(sema.randevu.id, sema.randevuIptalTalebi.randevuId))
    .leftJoin(sema.hasta, eq(sema.hasta.id, sema.randevu.hastaId))
    .where(eq(sema.randevuIptalTalebi.durum, "bekliyor"))
    .orderBy(asc(sema.randevuIptalTalebi.createdAt));
  return zamanlariIsoyaCevir(
    s.map((x): BekleyenIptalTalebiSatir => ({
      id: x.id,
      durum: x.durum as BekleyenIptalTalebiSatir["durum"],
      created_at: x.createdAt,
      aciklama: x.aciklama,
      gec_iptal: x.gecIptal,
      randevu: x.rId ? { id: x.rId, baslangic: x.rBaslangic!, durum: x.rDurum as RandevuDurum, hasta: x.hastaAd == null ? null : { ad_soyad: x.hastaAd } } : null,
    }))
  );
}

export async function bekleyenRandevuTalepleriGetir(tx: Tx): Promise<BekleyenRandevuTalebiSatir[]> {
  const s = await tx
    .select({
      id: sema.randevuTalebi.id,
      hastaId: sema.randevuTalebi.hastaId,
      islemTanimiId: sema.randevuTalebi.islemTanimiId,
      tercihTarih: sema.randevuTalebi.tercihTarih,
      tercihSaat: sema.randevuTalebi.tercihSaat,
      notMetni: sema.randevuTalebi.notMetni,
      createdAt: sema.randevuTalebi.createdAt,
      hastaAd: sema.hasta.adSoyad,
      islemAd: sema.islemTanimi.ad,
    })
    .from(sema.randevuTalebi)
    .leftJoin(sema.hasta, eq(sema.hasta.id, sema.randevuTalebi.hastaId))
    .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevuTalebi.islemTanimiId))
    .where(eq(sema.randevuTalebi.durum, "bekliyor"))
    .orderBy(asc(sema.randevuTalebi.createdAt));
  return zamanlariIsoyaCevir(
    s.map((x): BekleyenRandevuTalebiSatir => ({
      id: x.id,
      hasta_id: x.hastaId,
      islem_tanimi_id: x.islemTanimiId,
      tercih_tarih: x.tercihTarih,
      tercih_saat: x.tercihSaat,
      not_metni: x.notMetni,
      created_at: x.createdAt,
      hasta: x.hastaAd == null ? null : { ad_soyad: x.hastaAd },
      islem_tanimi: x.islemAd == null ? null : { ad: x.islemAd },
    }))
  );
}

/** Hasta Detayı > Randevu & Seans: hastanın aktif periyodik randevu serileri. */
export async function hastaPeriyodikRandevulariGetir(tx: Tx, hastaId: string): Promise<PeriyodikRandevuSatir[]> {
  const s = await tx
    .select({
      p: sema.periyodikRandevu,
      terapistAd: sema.personel.adSoyad,
      odaAd: sema.oda.ad,
      islemAd: sema.islemTanimi.ad,
    })
    .from(sema.periyodikRandevu)
    .leftJoin(sema.terapist, eq(sema.terapist.id, sema.periyodikRandevu.terapistId))
    .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId))
    .leftJoin(sema.oda, eq(sema.oda.id, sema.periyodikRandevu.odaId))
    .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.periyodikRandevu.islemTanimiId))
    .where(and(eq(sema.periyodikRandevu.hastaId, hastaId), eq(sema.periyodikRandevu.durum, "aktif")))
    .orderBy(asc(sema.periyodikRandevu.haftaninGunu));
  return s.map(({ p, ...e }): PeriyodikRandevuSatir => ({
    id: p.id,
    haftanin_gunu: p.haftaninGunu as HaftaninGunu,
    saat: p.saat,
    sure_dakika: p.sureDakika,
    durum: p.durum as "aktif" | "iptal",
    bitis_tarihi: p.bitisTarihi,
    otomatik_yenile: p.otomatikYenile,
    terapist: e.terapistAd == null ? null : { personel: { ad_soyad: e.terapistAd } },
    oda: e.odaAd == null ? null : { ad: e.odaAd },
    islem_tanimi: e.islemAd == null ? null : { ad: e.islemAd },
  }));
}

/** Hasta Detayı > Randevu & Seans listesi: hastanın son `limit` randevusu (arşivden aktarılanlar dahil; `kaynak` ile). */
export async function hastaRandevuListesiGetir(tx: Tx, hastaId: string, limit = 100): Promise<RandevuSatir[]> {
  const s = await tx
    .select({
      r: sema.randevu,
      terapistAd: sema.personel.adSoyad,
      odaAd: sema.oda.ad,
      islemId: sema.islemTanimi.id,
      islemAd: sema.islemTanimi.ad,
    })
    .from(sema.randevu)
    .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
    .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId))
    .leftJoin(sema.oda, eq(sema.oda.id, sema.randevu.odaId))
    .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevu.islemTanimiId))
    .where(eq(sema.randevu.hastaId, hastaId))
    .orderBy(desc(sema.randevu.baslangic))
    .limit(limit);
  return zamanlariIsoyaCevir(
    s.map(({ r, ...e }): RandevuSatir => ({
      id: r.id,
      baslangic: r.baslangic,
      bitis: r.bitis,
      durum: r.durum as RandevuDurum,
      gecikme_dakika: r.gecikmeDakika,
      kaynak: r.kaynak as "uygulama" | "arsiv",
      hasta: null,
      terapist: e.terapistAd == null ? null : { personel: { ad_soyad: e.terapistAd } },
      oda: e.odaAd == null ? null : { ad: e.odaAd },
      islem_tanimi: e.islemId ? { id: e.islemId, ad: e.islemAd ?? "" } : null,
    }))
  );
}

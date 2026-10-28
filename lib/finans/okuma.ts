// Kasa / Banka / Kredi Kartı sayfalarının veri okuması (withTenant içinde, RLS altında). Tutarlar DB'den metin gelir; istemciye `tl()` ile
// (en çok iki ondalıklı sayı) verilir. Dönem başı bakiyeler SQL'de (kasa_/banka_/kredi_karti_bakiye_once_toplam) hesaplanır — TEK doğruluk kaynağı.
// Satır şekilleri istemci bileşenlerinin beklediği snake_case'tir. Drizzle'da PostgREST'in 1000 satır sınırı yoktur; sıralama yine sabit (tarih + id).
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import { rpc, sema, type Tx } from "@/lib/db";
import { tl } from "@/lib/para";
import type { FinansDonemi } from "@/lib/finans/donem";
import type { KlinikArac, KlinikBankaHesabi, KlinikKrediKarti } from "@/types/klinik";

export type HastaOdemeSatiri = {
  id: string;
  created_at: string;
  tutar: number;
  tur: string;
  banka_hesap_id: string | null;
  odeme_yontemi: string | null;
  komisyon_orani: number | null;
  hasta: { ad_soyad: string } | null;
};
export type HarcamaSatiri = { id: string; tarih: string; tutar: number; tedarikci_adi: string | null; kategori: string; banka_hesap_id: string | null };
export type CariOdemeSatiri = { id: string; tarih: string; tutar: number; tedarikci_adi: string; aciklama: string | null; banka_hesap_id: string | null };
export type KartOdemeSatiri = { id: string; tarih: string; tutar: number; aciklama: string | null; banka_hesap_id: string | null; kart: { kart_adi: string } | null };
export type PersonelOdemeSatiri = { id: string; tarih: string; tutar: number; tur: string; banka_hesap_id: string | null; personel: { ad_soyad: string } | null };
export type NakitBankaSatiri = {
  id: string;
  tip: string;
  kaynak_kasa: boolean;
  kaynak_banka_hesap_id: string | null;
  hedef_kasa: boolean;
  hedef_banka_hesap_id: string | null;
  odeme_yontemi: string | null;
  tutar: number;
  tarih: string;
  aciklama: string | null;
  karsi_taraf_adi: string | null;
  karsi_taraf_banka: string | null;
  karsi_taraf_iban: string | null;
};
export type KamusalOdemeSatiri = { id: string; odeme_tarihi: string; tutar: number; odeme_tipi: string; banka_hesap_id: string | null; notlar: string | null };
export type DengelemeSatiri = { id: string; tutar: number; aciklama: string | null; ekleyen_ad: string; created_at: string };

/** Hasta ödeme/iade satırları: belirtilen yöntemler, dönem [baslangicTs, bitisTs). */
export async function hastaOdemeleriniGetir(tx: Tx, donem: FinansDonemi, yontemler: string[]): Promise<HastaOdemeSatiri[]> {
  const s = await tx
    .select({
      id: sema.hastaBakiyeHareket.id,
      created_at: sema.hastaBakiyeHareket.createdAt,
      tutar: sema.hastaBakiyeHareket.tutar,
      tur: sema.hastaBakiyeHareket.tur,
      banka_hesap_id: sema.hastaBakiyeHareket.bankaHesapId,
      odeme_yontemi: sema.hastaBakiyeHareket.odemeYontemi,
      komisyon_orani: sema.hastaBakiyeHareket.komisyonOrani,
      hasta_ad: sema.hasta.adSoyad,
    })
    .from(sema.hastaBakiyeHareket)
    .leftJoin(sema.hasta, eq(sema.hasta.id, sema.hastaBakiyeHareket.hastaId))
    .where(
      and(
        inArray(sema.hastaBakiyeHareket.tur, ["odeme", "iade"]),
        inArray(sema.hastaBakiyeHareket.odemeYontemi, yontemler),
        gte(sema.hastaBakiyeHareket.createdAt, donem.baslangicTs),
        lt(sema.hastaBakiyeHareket.createdAt, donem.bitisTs)
      )
    )
    .orderBy(asc(sema.hastaBakiyeHareket.createdAt), asc(sema.hastaBakiyeHareket.id));
  return s.map(({ hasta_ad, ...r }) => ({
    ...r,
    tutar: tl(r.tutar),
    komisyon_orani: r.komisyon_orani === null ? null : Number(r.komisyon_orani),
    hasta: hasta_ad === null ? null : { ad_soyad: hasta_ad },
  }));
}

export async function harcamalariGetir(tx: Tx, donem: FinansDonemi, odemeTipi: "nakit" | "havale" | "kredi_karti"): Promise<HarcamaSatiri[]> {
  const s = await tx
    .select({ id: sema.klinikHarcama.id, tarih: sema.klinikHarcama.tarih, tutar: sema.klinikHarcama.tutar, tedarikci_adi: sema.klinikHarcama.tedarikciAdi, kategori: sema.klinikHarcama.kategori, banka_hesap_id: sema.klinikHarcama.bankaHesapId })
    .from(sema.klinikHarcama)
    .where(and(eq(sema.klinikHarcama.odemeTipi, odemeTipi), gte(sema.klinikHarcama.tarih, donem.baslangic), lt(sema.klinikHarcama.tarih, donem.bitis)))
    .orderBy(asc(sema.klinikHarcama.tarih), asc(sema.klinikHarcama.id));
  return s.map((r) => ({ ...r, tutar: tl(r.tutar) }));
}

export async function cariOdemeleriniGetir(tx: Tx, donem: FinansDonemi, odemeTipi: "nakit" | "havale" | "kredi_karti"): Promise<CariOdemeSatiri[]> {
  const s = await tx
    .select({ id: sema.klinikCariOdeme.id, tarih: sema.klinikCariOdeme.tarih, tutar: sema.klinikCariOdeme.tutar, tedarikci_adi: sema.klinikCariOdeme.tedarikciAdi, aciklama: sema.klinikCariOdeme.aciklama, banka_hesap_id: sema.klinikCariOdeme.bankaHesapId })
    .from(sema.klinikCariOdeme)
    .where(and(eq(sema.klinikCariOdeme.odemeTipi, odemeTipi), gte(sema.klinikCariOdeme.tarih, donem.baslangic), lt(sema.klinikCariOdeme.tarih, donem.bitis)))
    .orderBy(asc(sema.klinikCariOdeme.tarih), asc(sema.klinikCariOdeme.id));
  return s.map((r) => ({ ...r, tutar: tl(r.tutar) }));
}

export async function kartOdemeleriniGetir(tx: Tx, donem: FinansDonemi, odemeTipi: "nakit" | "havale"): Promise<KartOdemeSatiri[]> {
  const s = await tx
    .select({ id: sema.klinikKrediKartiOdeme.id, tarih: sema.klinikKrediKartiOdeme.tarih, tutar: sema.klinikKrediKartiOdeme.tutar, aciklama: sema.klinikKrediKartiOdeme.aciklama, banka_hesap_id: sema.klinikKrediKartiOdeme.bankaHesapId, kart_adi: sema.klinikKrediKartlari.kartAdi })
    .from(sema.klinikKrediKartiOdeme)
    .leftJoin(sema.klinikKrediKartlari, eq(sema.klinikKrediKartlari.id, sema.klinikKrediKartiOdeme.krediKartiId))
    .where(and(eq(sema.klinikKrediKartiOdeme.odemeTipi, odemeTipi), gte(sema.klinikKrediKartiOdeme.tarih, donem.baslangic), lt(sema.klinikKrediKartiOdeme.tarih, donem.bitis)))
    .orderBy(asc(sema.klinikKrediKartiOdeme.tarih), asc(sema.klinikKrediKartiOdeme.id));
  return s.map(({ kart_adi, ...r }) => ({ ...r, tutar: tl(r.tutar), kart: kart_adi === null ? null : { kart_adi } }));
}

export async function personelOdemeleriniGetir(tx: Tx, donem: FinansDonemi, odemeTipi: "nakit" | "havale"): Promise<PersonelOdemeSatiri[]> {
  const H = sema.personelHesapHareket;
  const s = await tx
    .select({ id: H.id, tarih: H.tarih, tutar: H.tutar, tur: H.tur, banka_hesap_id: H.bankaHesapId, ad: sema.personel.adSoyad })
    .from(H)
    .leftJoin(sema.personel, eq(sema.personel.id, H.personelId))
    .where(and(eq(H.odemeTipi, odemeTipi), inArray(H.tur, ["odeme", "avans"]), gte(H.tarih, donem.baslangic), lt(H.tarih, donem.bitis)))
    .orderBy(asc(H.tarih), asc(H.id));
  return s.map(({ ad, ...r }) => ({ ...r, tutar: tl(r.tutar), personel: ad === null ? null : { ad_soyad: ad } }));
}

export async function nakitBankaHareketleriniGetir(tx: Tx, donem: FinansDonemi, kapsam: "kasa" | "banka"): Promise<NakitBankaSatiri[]> {
  const N = sema.nakitBankaHareketi;
  const kosul =
    kapsam === "kasa"
      ? or(eq(N.kaynakKasa, true), eq(N.hedefKasa, true))
      : or(isNotNull(N.kaynakBankaHesapId), isNotNull(N.hedefBankaHesapId));
  const s = await tx
    .select({
      id: N.id,
      tip: N.tip,
      kaynak_kasa: N.kaynakKasa,
      kaynak_banka_hesap_id: N.kaynakBankaHesapId,
      hedef_kasa: N.hedefKasa,
      hedef_banka_hesap_id: N.hedefBankaHesapId,
      odeme_yontemi: N.odemeYontemi,
      tutar: N.tutar,
      tarih: N.tarih,
      aciklama: N.aciklama,
      karsi_taraf_adi: N.karsiTarafAdi,
      karsi_taraf_banka: N.karsiTarafBanka,
      karsi_taraf_iban: N.karsiTarafIban,
    })
    .from(N)
    .where(and(kosul, gte(N.tarih, donem.baslangic), lt(N.tarih, donem.bitis)))
    .orderBy(asc(N.tarih), asc(N.id));
  return s.map((r) => ({ ...r, tutar: tl(r.tutar) }));
}

export async function kamusalOdemeleriniGetir(tx: Tx, donem: FinansDonemi, yontem: "nakit" | "havale"): Promise<KamusalOdemeSatiri[]> {
  const K = sema.kamusalOdeme;
  const s = await tx
    .select({ id: K.id, odeme_tarihi: K.odemeTarihi, tutar: K.tutar, odeme_tipi: K.odemeTipi, banka_hesap_id: K.bankaHesapId, notlar: K.notlar })
    .from(K)
    .where(and(eq(K.odemeYontemi, yontem), isNotNull(K.odemeTarihi), gte(K.odemeTarihi, donem.baslangic), lt(K.odemeTarihi, donem.bitis)))
    .orderBy(asc(K.odemeTarihi), asc(K.id));
  return s.map((r) => ({ ...r, odeme_tarihi: r.odeme_tarihi as string, tutar: tl(r.tutar) }));
}

export async function dengelemeleriGetir(tx: Tx, donem: FinansDonemi): Promise<DengelemeSatiri[]> {
  const D = sema.kasaDengeleme;
  const s = await tx
    .select({ id: D.id, tutar: D.tutar, aciklama: D.aciklama, ekleyen_ad: D.ekleyenAd, created_at: D.createdAt })
    .from(D)
    .where(and(gte(D.createdAt, donem.baslangicTs), lt(D.createdAt, donem.bitisTs)))
    .orderBy(asc(D.createdAt), asc(D.id));
  return s.map((r) => ({ ...r, tutar: tl(r.tutar) }));
}

export async function bankaHesaplariniGetir(tx: Tx, hesapSahibiDahil = false): Promise<KlinikBankaHesabi[]> {
  const B = sema.klinikBankaHesaplari;
  const s = await tx.select({ id: B.id, banka_adi: B.bankaAdi, sube: B.sube, hesap_sahibi: B.hesapSahibi }).from(B).orderBy(asc(B.sortOrder));
  return s.map(({ hesap_sahibi, ...r }) => (hesapSahibiDahil ? { ...r, hesap_sahibi } : r));
}

export async function aktifPersoneliGetir(tx: Tx): Promise<{ id: string; ad_soyad: string }[]> {
  return tx.select({ id: sema.personel.id, ad_soyad: sema.personel.adSoyad }).from(sema.personel).where(eq(sema.personel.aktif, true)).orderBy(asc(sema.personel.adSoyad));
}

export async function araclariGetir(tx: Tx): Promise<KlinikArac[]> {
  return tx.select({ id: sema.klinikArac.id, marka: sema.klinikArac.marka, model: sema.klinikArac.model, plaka: sema.klinikArac.plaka }).from(sema.klinikArac).orderBy(asc(sema.klinikArac.plaka));
}

export async function krediKartlariniGetir(tx: Tx): Promise<KlinikKrediKarti[]> {
  const K = sema.klinikKrediKartlari;
  const s = await tx
    .select({ id: K.id, kart_tipi: K.kartTipi, kart_adi: K.kartAdi, banka_adi: K.bankaAdi, kart_sahibi: K.kartSahibi, son_dort_hane: K.sonDortHane })
    .from(K)
    .orderBy(asc(K.sortOrder));
  return s as KlinikKrediKarti[];
}

/** Dönem başı bakiyeler — SQL (SECURITY DEFINER, rol kontrolü fonksiyon içinde) tek doğruluk kaynağıdır. Dönüş: kuruş değil TL sayısı (≤2 ondalık). */
export async function kasaDonemBasiBakiyesi(tx: Tx, donem: FinansDonemi): Promise<number> {
  const r = await rpc<{ kasa_bakiye_once_toplam: string | null }>(tx, "kasa_bakiye_once_toplam", { p_once_tarih: donem.baslangic });
  return tl(r[0]?.kasa_bakiye_once_toplam);
}

export async function bankaDonemBasiBakiyeleri(tx: Tx, donem: FinansDonemi): Promise<Record<string, number>> {
  const r = await rpc<{ banka_hesap_id: string; toplam: string }>(tx, "banka_bakiye_once_toplam_tumu", { p_once_tarih: donem.baslangic });
  const harita: Record<string, number> = {};
  for (const s of r) harita[s.banka_hesap_id] = tl(s.toplam);
  return harita;
}

export async function krediKartiDonemBasiBakiyesi(tx: Tx, donem: FinansDonemi): Promise<number> {
  const r = await rpc<{ kredi_karti_bakiye_once_toplam: string | null }>(tx, "kredi_karti_bakiye_once_toplam", { p_once_tarih: donem.baslangic });
  return tl(r[0]?.kredi_karti_bakiye_once_toplam);
}

export type KartHareketSatiri = { kaynak: "gider" | "cari_odeme" | "kart_odemesi"; id: string; kredi_karti_id: string | null; tarih: string; tip: "harcama" | "odeme"; tutar: number; ad: string | null; detay: string | null; yontem: string | null; banka_hesap_id: string | null };

export async function kartHareketleriniGetir(tx: Tx, baslangic: string | null): Promise<KartHareketSatiri[]> {
  const V = sema.klinikKrediKartiHareketleri;
  const r = await tx
    .select({ kaynak: V.kaynak, id: V.id, kredi_karti_id: V.krediKartiId, tarih: V.tarih, tip: V.tip, tutar: V.tutar, ad: V.ad, detay: V.detay, yontem: V.yontem, banka_hesap_id: V.bankaHesapId })
    .from(V)
    .where(baslangic ? gte(V.tarih, baslangic) : undefined)
    .orderBy(desc(V.tarih), asc(V.kaynak), asc(V.id));
  return r.map((x) => ({ ...x, kaynak: x.kaynak as KartHareketSatiri["kaynak"], id: x.id as string, tarih: x.tarih as string, tip: x.tip as KartHareketSatiri["tip"], tutar: tl(x.tutar) }));
}

export async function kartBorcOzetleriniGetir(tx: Tx, klinikId: string): Promise<{ kredi_karti_id: string | null; harcama: number; odeme: number }[]> {
  const r = await rpc<{ kredi_karti_id: string | null; harcama: string; odeme: string }>(tx, "kredi_karti_borc_ozetleri", { p_klinik_id: klinikId });
  return r.map((x) => ({ kredi_karti_id: x.kredi_karti_id, harcama: tl(x.harcama), odeme: tl(x.odeme) }));
}

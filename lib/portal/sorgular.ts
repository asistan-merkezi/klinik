// Hasta portalı okuma sorguları (Drizzle). `hastaId` OTURUMDAN gelir (istemciden asla); ayrıca satır düzeyinde RLS (`current_hasta_id()`) hastanın
// yalnız KENDİ kayıtlarını görmesini garanti eder — kodda verilen hastaId'ye ek olarak ikinci kilittir. Şekiller types/portal.ts ile aynı.
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { sema, zamanlariIsoyaCevir, type Tx } from "@/lib/db";
import type { PortalRandevuSatir, PortalRandevuTalebiSatir } from "@/types/portal";
import type { PaketSatisSatir, OdemeYontemi } from "@/types/odeme";
import type { RandevuDurum } from "@/types/randevu";
import type { HastaDetay } from "@/types/hasta";
import type { HastaHassasSatir } from "@/types/hasta-hassas";
import { hassasSatiriCevir } from "@/lib/hasta/hassas-satir";

export type PortalOdemeSatiri = {
  id: string;
  created_at: string;
  tur: "odeme" | "iade";
  tutar: number;
  odeme_yontemi: OdemeYontemi | null;
};

async function portalRandevulari(tx: Tx, hastaId: string, bitisKosulu: "gelecek" | "gecmis", simdi: string, limit?: number): Promise<PortalRandevuSatir[]> {
  const kosul = bitisKosulu === "gelecek" ? gte(sema.randevu.bitis, simdi) : lt(sema.randevu.bitis, simdi);
  let sorgu = tx
    .select({ r: sema.randevu, terapistAd: sema.personel.adSoyad, odaAd: sema.oda.ad })
    .from(sema.randevu)
    .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
    .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId))
    .leftJoin(sema.oda, eq(sema.oda.id, sema.randevu.odaId))
    .where(and(eq(sema.randevu.hastaId, hastaId), kosul))
    .orderBy(bitisKosulu === "gelecek" ? asc(sema.randevu.baslangic) : desc(sema.randevu.baslangic))
    .$dynamic();
  if (limit) sorgu = sorgu.limit(limit);
  const s = await sorgu;
  const ids = s.map((x) => x.r.id);
  const talepler = ids.length ? await tx.select({ id: sema.randevuIptalTalebi.id, durum: sema.randevuIptalTalebi.durum, randevuId: sema.randevuIptalTalebi.randevuId }).from(sema.randevuIptalTalebi).where(inArray(sema.randevuIptalTalebi.randevuId, ids)) : [];
  const harita = new Map(talepler.map((t) => [t.randevuId, { id: t.id, durum: t.durum as "bekliyor" | "onaylandi" | "reddedildi" }]));
  return zamanlariIsoyaCevir(
    s.map(({ r, terapistAd, odaAd }): PortalRandevuSatir => ({
      id: r.id,
      baslangic: r.baslangic,
      bitis: r.bitis,
      durum: r.durum as RandevuDurum,
      terapist: terapistAd == null ? null : { personel: { ad_soyad: terapistAd } },
      oda: odaAd == null ? null : { ad: odaAd },
      randevu_iptal_talebi: harita.get(r.id) ?? null,
    }))
  );
}

export async function portalAnaVeriGetir(tx: Tx, hastaId: string) {
  const simdi = new Date().toISOString();
  const hasta = (await tx.select({ ad_soyad: sema.hasta.adSoyad, telefon: sema.hasta.telefon }).from(sema.hasta).where(eq(sema.hasta.id, hastaId)).limit(1))[0] ?? null;
  const yaklasan = await portalRandevulari(tx, hastaId, "gelecek", simdi);
  const gecmis = await portalRandevulari(tx, hastaId, "gecmis", simdi, 10);
  const paketRows = await tx
    .select({ id: sema.paketSatis.id, kalan: sema.paketSatis.kalanAdet, durum: sema.paketSatis.durum, satis: sema.paketSatis.satisTarihi, ad: sema.paket.ad, seans: sema.paket.seansSayisi })
    .from(sema.paketSatis)
    .leftJoin(sema.paket, eq(sema.paket.id, sema.paketSatis.paketId))
    .where(and(eq(sema.paketSatis.hastaId, hastaId), eq(sema.paketSatis.durum, "aktif")))
    .orderBy(asc(sema.paketSatis.satisTarihi));
  const aktifPaketler: PaketSatisSatir[] = paketRows.map((p) => ({ id: p.id, kalan_adet: p.kalan, durum: p.durum, satis_tarihi: p.satis, paket: p.ad == null ? null : { ad: p.ad, seans_sayisi: p.seans ?? 0 } }));
  // Gerçek tahsilat/iade defteri hasta_bakiye_hareket'tir (Kasa/Banka/Raporlar ile aynı kaynak).
  const odemeRows = await tx
    .select({ id: sema.hastaBakiyeHareket.id, createdAt: sema.hastaBakiyeHareket.createdAt, tur: sema.hastaBakiyeHareket.tur, tutar: sema.hastaBakiyeHareket.tutar, yontem: sema.hastaBakiyeHareket.odemeYontemi })
    .from(sema.hastaBakiyeHareket)
    .where(and(eq(sema.hastaBakiyeHareket.hastaId, hastaId), inArray(sema.hastaBakiyeHareket.tur, ["odeme", "iade"])))
    .orderBy(desc(sema.hastaBakiyeHareket.createdAt))
    .limit(20);
  const odemeGecmisi: PortalOdemeSatiri[] = zamanlariIsoyaCevir(odemeRows.map((o) => ({ id: o.id, created_at: o.createdAt, tur: o.tur as "odeme" | "iade", tutar: Number(o.tutar), odeme_yontemi: (o.yontem as OdemeYontemi | null) ?? null })));
  const talepRows = await tx
    .select({ t: sema.randevuTalebi, ad: sema.islemTanimi.ad })
    .from(sema.randevuTalebi)
    .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevuTalebi.islemTanimiId))
    .where(eq(sema.randevuTalebi.hastaId, hastaId))
    .orderBy(desc(sema.randevuTalebi.createdAt))
    .limit(10);
  const randevuTalepleri: PortalRandevuTalebiSatir[] = zamanlariIsoyaCevir(
    talepRows.map(({ t, ad }) => ({
      id: t.id,
      islem_tanimi: ad == null ? null : { ad },
      tercih_tarih: t.tercihTarih,
      tercih_saat: t.tercihSaat,
      not_metni: t.notMetni,
      durum: t.durum as PortalRandevuTalebiSatir["durum"],
      created_at: t.createdAt,
    }))
  );
  return { hasta, yaklasan, gecmis, aktifPaketler, odemeGecmisi, randevuTalepleri };
}

export async function portalBilgilerimGetir(tx: Tx, hastaId: string): Promise<{ hasta: HastaDetay | null; hassas: HastaHassasSatir | null }> {
  const h = (await tx.select().from(sema.hasta).where(eq(sema.hasta.id, hastaId)).limit(1))[0];
  const hs = (await tx.select().from(sema.hastaHassas).where(eq(sema.hastaHassas.hastaId, hastaId)).limit(1))[0];
  const hasta = h
    ? (zamanlariIsoyaCevir({
        id: h.id,
        ad_soyad: h.adSoyad,
        telefon: h.telefon,
        dogum_tarihi: h.dogumTarihi,
        kvkk_onay_tarihi: h.kvkkOnayTarihi,
        whatsapp_izin_durumu: h.whatsappIzinDurumu,
        cinsiyet: h.cinsiyet,
        eposta: h.eposta,
        referans_kanali: h.referansKanali,
        ozel_nitelikli_veri_onay_tarihi: h.ozelNitelikliVeriOnayTarihi,
        ticari_ileti_onay_tarihi: h.ticariIletiOnayTarihi,
        updated_at: h.updatedAt,
        son_guncelleyen_tip: h.sonGuncelleyenTip,
      }) as unknown as HastaDetay)
    : null;
  return { hasta, hassas: hs ? hassasSatiriCevir(hs) : null };
}

export async function portalTedaviSecenekleriGetir(tx: Tx): Promise<{ id: string; ad: string }[]> {
  return tx.select({ id: sema.islemTanimi.id, ad: sema.islemTanimi.ad }).from(sema.islemTanimi).where(eq(sema.islemTanimi.aktif, true)).orderBy(asc(sema.islemTanimi.ad));
}

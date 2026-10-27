"use server";

// İstemci bileşenlerinin (react-query kancaları, canlı çizelge, bildirimler) kullandığı OKUMA eylemleri. Eskiden tarayıcıdan doğrudan Supabase
// (RLS'li) çağrılıyordu; artık oturum + withTenant üzerinden sunucuda çalışır. Tenant/rol oturumdan gelir, istemciden asla.
// Girdiler doğrulanır (uuid/tarih); hata durumunda istemci kancası fırlatılan hatayı react-query ile gösterir.
import { and, asc, eq, gt, gte, inArray, lt, notInArray, or } from "drizzle-orm";
import { z } from "zod";
import { rpc, sema, withTenant, zamanlariIsoyaCevir } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { gunAraligi } from "@/lib/utils";
import { randevuSatirlariGetir, kendiTerapistIdGetir, tabletRandevulariGetir } from "@/lib/randevu/sorgular";
import type { MesgulAraliklar } from "@/lib/randevu/musait-saatler";
import type { RandevuSatir } from "@/types/randevu";

const uuid = z.string().uuid();
const tarihSemasi = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Canlı çizelge: seçili İstanbul gününün randevuları. */
export async function gunlukRandevulariGetir(tarih: string): Promise<RandevuSatir[]> {
  const t = tarihSemasi.parse(tarih);
  const { bag } = await panelBaglami();
  const { baslangic, bitis } = gunAraligi(new Date(`${t}T12:00:00Z`));
  return withTenant(bag, (tx) => randevuSatirlariGetir(tx, { baslangic, bitis }));
}

/** Oda tableti: BUGÜNÜN o odadaki randevuları (DAR şekil: sağlık/finans alanları yok). */
export async function odaGunlukRandevulariGetir(odaId: string): Promise<RandevuSatir[]> {
  const id = uuid.parse(odaId);
  const { bag } = await panelBaglami();
  const { baslangic, bitis } = gunAraligi();
  return withTenant(bag, (tx) => tabletRandevulariGetir(tx, { baslangic, bitis, odaId: id }));
}

/** Bildirimler: bugünün randevularının id→durum haritası (yalnız id+durum) + (terapistse) kendi terapist.id'si. */
export async function bildirimBaslangicVerisiGetir(): Promise<{ durumlar: { id: string; durum: string }[]; kendiTerapistId: string | null }> {
  const { ctx, bag } = await panelBaglami();
  const { baslangic, bitis } = gunAraligi();
  return withTenant(bag, async (tx) => ({
    durumlar: await tx
      .select({ id: sema.randevu.id, durum: sema.randevu.durum })
      .from(sema.randevu)
      .where(and(gte(sema.randevu.baslangic, baslangic), lt(sema.randevu.baslangic, bitis))),
    kendiTerapistId: ctx.rol === "terapist" ? await kendiTerapistIdGetir(tx, ctx.userId) : null,
  }));
}

/** Bildirimler: tek randevunun güncel durumu (olay yükünde veri yok → yetkili yoldan çekilir). */
export async function randevuDurumGetir(randevuId: string): Promise<{ id: string; durum: string; terapist_id: string | null } | null> {
  const id = uuid.parse(randevuId);
  const { bag } = await panelBaglami();
  const s = (await withTenant(bag, (tx) => tx.select({ id: sema.randevu.id, durum: sema.randevu.durum, terapist_id: sema.randevu.terapistId }).from(sema.randevu).where(eq(sema.randevu.id, id)).limit(1)))[0];
  return s ?? null;
}

/** Bildirim metni için: başlangıç, hasta/oda adı, paket kalan hak + paket adı. */
export async function bildirimBilgisiGetir(randevuId: string): Promise<{
  baslangic: string;
  hasta: { ad_soyad: string } | null;
  oda: { ad: string } | null;
  paket_satis: { kalan_adet: number; paket: { ad: string } | null } | null;
} | null> {
  const id = uuid.parse(randevuId);
  const { bag } = await panelBaglami();
  const s = (
    await withTenant(bag, (tx) =>
      tx
        .select({ baslangic: sema.randevu.baslangic, hastaAd: sema.hasta.adSoyad, odaAd: sema.oda.ad, paketSatisId: sema.randevu.paketSatisId, kalan: sema.paketSatis.kalanAdet, paketAd: sema.paket.ad })
        .from(sema.randevu)
        .leftJoin(sema.hasta, eq(sema.hasta.id, sema.randevu.hastaId))
        .leftJoin(sema.oda, eq(sema.oda.id, sema.randevu.odaId))
        .leftJoin(sema.paketSatis, eq(sema.paketSatis.id, sema.randevu.paketSatisId))
        .leftJoin(sema.paket, eq(sema.paket.id, sema.paketSatis.paketId))
        .where(eq(sema.randevu.id, id))
        .limit(1)
    )
  )[0];
  if (!s) return null;
  return zamanlariIsoyaCevir({
    baslangic: s.baslangic,
    hasta: s.hastaAd == null ? null : { ad_soyad: s.hastaAd },
    oda: s.odaAd == null ? null : { ad: s.odaAd },
    paket_satis: s.paketSatisId && s.kalan != null ? { kalan_adet: s.kalan, paket: s.paketAd == null ? null : { ad: s.paketAd } } : null,
  });
}

export type HastaAktifPaketSatiri = {
  id: string;
  kalan_adet: number;
  paket: { ad: string; islem_tanimi_id: string; islem_tanimi: { ad: string } | null } | null;
};

/** Randevu formu: hastanın hâlâ hakkı olan (aktif, kalan_adet>0) paketleri. */
export async function hastaAktifPaketleriGetir(hastaId: string): Promise<HastaAktifPaketSatiri[]> {
  const id = uuid.parse(hastaId);
  const { bag } = await panelBaglami();
  const s = await withTenant(bag, (tx) =>
    tx
      .select({ id: sema.paketSatis.id, kalan: sema.paketSatis.kalanAdet, paketAd: sema.paket.ad, islemId: sema.paket.islemTanimiId, islemAd: sema.islemTanimi.ad })
      .from(sema.paketSatis)
      .leftJoin(sema.paket, eq(sema.paket.id, sema.paketSatis.paketId))
      .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.paket.islemTanimiId))
      .where(and(eq(sema.paketSatis.hastaId, id), eq(sema.paketSatis.durum, "aktif"), gt(sema.paketSatis.kalanAdet, 0)))
  );
  return s.map((x) => ({
    id: x.id,
    kalan_adet: x.kalan,
    paket: x.paketAd == null ? null : { ad: x.paketAd, islem_tanimi_id: x.islemId!, islem_tanimi: x.islemAd == null ? null : { ad: x.islemAd } },
  }));
}

/** Randevu formu: hasta kategorisine göre SUNUCUDA hesaplanan tedavi bedeli (istemci fiyat hesaplamaz/göndermez). */
export async function tedaviEtkinFiyatGetir(islemTanimiId: string, hastaId: string): Promise<number | null> {
  const islem = uuid.parse(islemTanimiId);
  const hasta = uuid.parse(hastaId);
  const { bag } = await panelBaglami();
  const satir = (await withTenant(bag, (tx) => rpc<{ islem_tanimi_etkin_fiyat: string | number | null }>(tx, "islem_tanimi_etkin_fiyat", { p_islem_tanimi_id: islem, p_hasta_id: hasta })))[0];
  const v = satir?.islem_tanimi_etkin_fiyat;
  return v == null ? null : Number(v);
}

/**
 * [basTarih, bitTarih] günleri (İstanbul, uçlar dahil) içinde seçili terapist VEYA odanın dolu olduğu aralıklar + cihaz rezervasyonları (epoch ms).
 * DB'deki exclusion constraint'lerle AYNI kural (iptal/gelmedi hariç); asıl güvence yine constraint. Cihaz sorgusu hata verirse boş sayılır (fail-open).
 */
export async function mesgulAraliklariGetir(basTarih: string, bitTarih: string, terapistId: string, odaId: string, cihazIdleri: string[]): Promise<MesgulAraliklar> {
  const { toUTC } = await import("@/lib/datetime");
  const girdi = z
    .object({ bas: tarihSemasi, bit: tarihSemasi, terapist: uuid, oda: uuid, cihazlar: z.array(uuid).max(20) })
    .parse({ bas: basTarih, bit: bitTarih, terapist: terapistId, oda: odaId, cihazlar: cihazIdleri });
  const { bag } = await panelBaglami();
  const bas = toUTC(`${girdi.bas}T00:00:00`);
  const bit = new Date(new Date(toUTC(`${girdi.bit}T00:00:00`)).getTime() + 24 * 60 * 60_000).toISOString();

  const kaynak = await withTenant(bag, (tx) =>
    tx
      .select({ baslangic: sema.randevu.baslangic, bitis: sema.randevu.bitis })
      .from(sema.randevu)
      .where(and(or(eq(sema.randevu.terapistId, girdi.terapist), eq(sema.randevu.odaId, girdi.oda)), lt(sema.randevu.baslangic, bit), gt(sema.randevu.bitis, bas), notInArray(sema.randevu.durum, ["iptal", "gelmedi"])))
  );

  let cihaz: MesgulAraliklar["cihaz"] = [];
  if (girdi.cihazlar.length > 0) {
    try {
      const rez = await withTenant(bag, (tx) =>
        tx
          .select({ cihazId: sema.randevuCihazRezervasyon.cihazId, baslangic: sema.randevuCihazRezervasyon.baslangic, bitis: sema.randevuCihazRezervasyon.bitis })
          .from(sema.randevuCihazRezervasyon)
          .where(and(inArray(sema.randevuCihazRezervasyon.cihazId, girdi.cihazlar), lt(sema.randevuCihazRezervasyon.baslangic, bit), gt(sema.randevuCihazRezervasyon.bitis, bas)))
      );
      cihaz = rez.map((r) => ({ cihazId: r.cihazId, bas: new Date(r.baslangic).getTime(), bit: new Date(r.bitis).getTime() }));
    } catch {
      cihaz = [];
    }
  }
  return { kaynak: kaynak.map((r) => ({ bas: new Date(r.baslangic).getTime(), bit: new Date(r.bitis).getTime() })), cihaz };
}

/** Randevu detayı "Ödeme Ekle" kartı: hastanın güncel bakiyesi (v_hasta_ozet). Yalnız finansal işlem yapabilen roller (kartı onlar görür). */
export async function hastaGuncelBakiyeGetir(hastaId: string): Promise<number> {
  const id = uuid.parse(hastaId);
  const { ctx, bag } = await panelBaglami();
  if (!["klinik_admin", "resepsiyon", "muhasebe"].includes(ctx.rol)) throw new Error("Bu bilgi için yetkiniz yok.");
  const s = (await withTenant(bag, (tx) => tx.select({ bakiye: sema.vHastaOzet.bakiye }).from(sema.vHastaOzet).where(eq(sema.vHastaOzet.hastaId, id)).limit(1)))[0];
  return Number(s?.bakiye ?? 0);
}

/** Randevudaki tedavinin yapılacak işlem adımları (sırayla). */
export async function tedaviAdimlariGetir(islemTanimiId: string): Promise<{ id: string; ad: string; sure_dakika: number | null; cihaz: { ad: string } | null }[]> {
  const id = uuid.parse(islemTanimiId);
  const { bag } = await panelBaglami();
  const s = await withTenant(bag, (tx) =>
    tx
      .select({ id: sema.islemTanimiAdim.id, ad: sema.islemTanimiAdim.ad, sure: sema.islemTanimiAdim.sureDakika, cihazAd: sema.cihaz.ad })
      .from(sema.islemTanimiAdim)
      .leftJoin(sema.cihaz, eq(sema.cihaz.id, sema.islemTanimiAdim.gerekliCihazId))
      .where(eq(sema.islemTanimiAdim.islemTanimiId, id))
      .orderBy(asc(sema.islemTanimiAdim.sira))
  );
  return s.map((x) => ({ id: x.id, ad: x.ad, sure_dakika: x.sure, cihaz: x.cihazAd == null ? null : { ad: x.cihazAd } }));
}

/** Paket kullanım geçmişi: bu paket satışından fiilen düşülen (check-in yapılmış) seanslar. */
export async function paketKullaniminiGetir(paketSatisId: string): Promise<{ id: string; baslangic: string; durum: string; gecikme_dakika: number | null; terapist: { personel: { ad_soyad: string } | null } | null }[]> {
  const id = uuid.parse(paketSatisId);
  const { bag } = await panelBaglami();
  const s = await withTenant(bag, (tx) =>
    tx
      .select({ id: sema.randevu.id, baslangic: sema.randevu.baslangic, durum: sema.randevu.durum, gecikme: sema.randevu.gecikmeDakika, terapistAd: sema.personel.adSoyad })
      .from(sema.randevu)
      .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
      .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId))
      .where(eq(sema.randevu.paketSatisId, id))
      .orderBy(asc(sema.randevu.baslangic))
  );
  return zamanlariIsoyaCevir(s.map((x) => ({ id: x.id, baslangic: x.baslangic, durum: x.durum as string, gecikme_dakika: x.gecikme, terapist: x.terapistAd == null ? null : { personel: { ad_soyad: x.terapistAd } } })));
}

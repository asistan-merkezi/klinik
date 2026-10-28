// Hastalar listesi sayfasının okuma sorguları (Drizzle). Harf çubuğu/sayfalama fonksiyonları DB'de (`hasta_bas_harf_sayilari`, `hasta_harf_listesi`),
// sıralama collation'a GÜVENMEZ (turkce_sira_anahtari). Ek veriler (adres, bakiye, aktif protokol, paket ilerlemesi) tek tur sorgu + Map ile birleşir.
import { eq, inArray } from "drizzle-orm";
import { rpc, sema, zamanlariIsoyaCevir, type Tx } from "@/lib/db";
import type { HastaListeSatiri } from "@/types/hasta";
import type { HastaAramaSatiri } from "./arama";

export type ListeSatiri = Omit<HastaListeSatiri, "bakiye" | "aktif_protokol_ad" | "paketIlerleme">;

export async function harfSayilariGetir(tx: Tx): Promise<{ harf: string | null; adet: number }[]> {
  const s = await rpc<{ harf: string | null; adet: string | number }>(tx, "hasta_bas_harf_sayilari", {});
  return s.map((x) => ({ harf: x.harf, adet: Number(x.adet) }));
}

export async function harfListesiGetir(tx: Tx, harf: string | null, bas: number, adet: number): Promise<HastaAramaSatiri[]> {
  const s = await rpc<HastaAramaSatiri>(tx, "hasta_harf_listesi", { p_harf: harf, p_bas: bas, p_adet: adet });
  return zamanlariIsoyaCevir(
    s.map((h) => ({
      id: h.id,
      ad_soyad: h.ad_soyad,
      telefon: h.telefon,
      dogum_tarihi: h.dogum_tarihi,
      kvkk_onay_tarihi: h.kvkk_onay_tarihi,
      whatsapp_izin_durumu: h.whatsapp_izin_durumu,
      eposta: h.eposta,
      kategori: h.kategori,
    }))
  );
}

/** Listedeki hastalar için adres (hasta_hassas), bakiye, aktif protokol ve paket ilerlemesi. */
export async function listeEkVerisiGetir(tx: Tx, hastalar: HastaAramaSatiri[]): Promise<HastaListeSatiri[]> {
  const ids = hastalar.map((h) => h.id);
  if (ids.length === 0) return [];
  const [adresler, ozetler, detay, paketler] = await Promise.all([
    tx.select({ hastaId: sema.hastaHassas.hastaId, adres: sema.hastaHassas.adres }).from(sema.hastaHassas).where(inArray(sema.hastaHassas.hastaId, ids)),
    tx.select({ hastaId: sema.vHastaOzet.hastaId, bakiye: sema.vHastaOzet.bakiye }).from(sema.vHastaOzet).where(inArray(sema.vHastaOzet.hastaId, ids)),
    tx.select({ hastaId: sema.vHastaDetayOzet.hastaId, protokol: sema.vHastaDetayOzet.aktifProtokolAd }).from(sema.vHastaDetayOzet).where(inArray(sema.vHastaDetayOzet.hastaId, ids)),
    tx
      .select({ hastaId: sema.vHastaAktifPaket.hastaId, kalan: sema.vHastaAktifPaket.kalanAdet, seans: sema.paket.seansSayisi })
      .from(sema.vHastaAktifPaket)
      .innerJoin(sema.paket, eq(sema.paket.id, sema.vHastaAktifPaket.paketId))
      .where(inArray(sema.vHastaAktifPaket.hastaId, ids)),
  ]);
  const adresMap = new Map(adresler.map((a) => [a.hastaId, a.adres]));
  const bakiyeMap = new Map(ozetler.map((o) => [o.hastaId, Number(o.bakiye ?? 0)]));
  const protokolMap = new Map(detay.map((d) => [d.hastaId, d.protokol]));
  const paketMap = new Map<string, { kalan: number; toplam: number }>();
  for (const p of paketler) {
    const m = paketMap.get(p.hastaId) ?? { kalan: 0, toplam: 0 };
    m.kalan += p.kalan;
    m.toplam += p.seans;
    paketMap.set(p.hastaId, m);
  }
  return hastalar.map((h) => {
    const paket = paketMap.get(h.id);
    return {
      id: h.id,
      ad_soyad: h.ad_soyad,
      telefon: h.telefon,
      dogum_tarihi: h.dogum_tarihi,
      kvkk_onay_tarihi: h.kvkk_onay_tarihi,
      whatsapp_izin_durumu: h.whatsapp_izin_durumu,
      eposta: h.eposta,
      hasta_hassas: adresMap.has(h.id) ? { adres: adresMap.get(h.id) ?? null } : null,
      bakiye: bakiyeMap.get(h.id) ?? 0,
      aktif_protokol_ad: protokolMap.get(h.id) ?? null,
      paketIlerleme: paket && paket.toplam > 0 ? { kullanilan: paket.toplam - paket.kalan, toplam: paket.toplam } : null,
    };
  });
}

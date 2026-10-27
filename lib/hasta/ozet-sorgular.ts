// v_hasta_ozet / v_hasta_detay_ozet okuma (Drizzle). Görünümler SECURITY INVOKER: çağıranın RLS'i geçerli. numeric/bigint kolonlar sayıya çevrilir.
import { eq } from "drizzle-orm";
import { sema, zamanlariIsoyaCevir, type Tx } from "@/lib/db";
import type { HastaDetayOzet, HastaOzet } from "@/types/hasta-detay";

const n = (v: string | number | null | undefined) => Number(v ?? 0);
const nn = (v: string | number | null | undefined) => (v == null ? null : Number(v));

export async function hastaOzetGetir(tx: Tx, hastaId: string): Promise<HastaOzet | null> {
  const s = (await tx.select().from(sema.vHastaOzet).where(eq(sema.vHastaOzet.hastaId, hastaId)).limit(1))[0];
  if (!s) return null;
  return zamanlariIsoyaCevir({
    hasta_id: s.hastaId!,
    klinik_id: s.klinikId!,
    son_vas_skoru: nn(s.sonVasSkoru),
    son_vas_tarihi: s.sonVasTarihi,
    aktif_hedef_sayisi: n(s.aktifHedefSayisi),
    kalan_paket_hakki: n(s.kalanPaketHakki),
    bakiye: n(s.bakiye),
    son_seans_tarihi: s.sonSeansTarihi,
    aktif_risk_bayrak_sayisi: n(s.aktifRiskBayrakSayisi),
    no_show_sayisi: n(s.noShowSayisi),
  });
}

export async function hastaDetayOzetGetir(tx: Tx, hastaId: string): Promise<HastaDetayOzet | null> {
  const s = (await tx.select().from(sema.vHastaDetayOzet).where(eq(sema.vHastaDetayOzet.hastaId, hastaId)).limit(1))[0];
  if (!s) return null;
  return zamanlariIsoyaCevir({
    hasta_id: s.hastaId!,
    klinik_id: s.klinikId!,
    son_vas_skoru: nn(s.sonVasSkoru),
    son_vas_tarihi: s.sonVasTarihi,
    aktif_hedef_sayisi: n(s.aktifHedefSayisi),
    kalan_paket_hakki: n(s.kalanPaketHakki),
    bakiye: n(s.bakiye),
    son_seans_tarihi: s.sonSeansTarihi,
    aktif_risk_bayrak_sayisi: n(s.aktifRiskBayrakSayisi),
    no_show_sayisi: n(s.noShowSayisi),
    sonraki_randevu_tarihi: s.sonrakiRandevuTarihi,
    aktif_protokol_ad: s.aktifProtokolAd,
    olcum_sayisi: n(s.olcumSayisi),
    belge_sayisi: n(s.belgeSayisi),
    son_iletisim_tarihi: s.sonIletisimTarihi,
  });
}

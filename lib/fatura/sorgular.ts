// Kesilen Faturalar liste/detay sorguları: `tur='borc'` hasta_bakiye_hareket satırı + hasta + hasta_hassas (yalnız kimlik/adres; sağlık alanları ÇEKİLMEZ)
// + tedavi (ad, muhasebe adı, KDV oranı) + fatura. Tutarlar TL sayısıdır (≤2 ondalık); KDV/net hesabı lib/para.ts kuralıyla (kuruş) yapılır.
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";
import { tl } from "@/lib/para";
import type { FaturaSatir } from "@/types/odeme";

export type BorcSorguSatiri = {
  id: string;
  hasta_id: string;
  tutar: number;
  iskonto_tutari: number;
  aciklama: string | null;
  created_at: string;
  hasta: { ad_soyad: string; eposta: string | null } | null;
  hassas: { kimlik_no: string | null; kimlik_no_tipi: string | null; adres: string | null } | null;
  islem: { ad: string; muhasebe_hizmet_ismi: string | null; kdv_orani: string } | null;
  fatura: FaturaSatir | null;
};

export async function borcSatirlariniGetir(
  tx: Tx,
  secenek: { baslangic?: string; bitis?: string; limit?: number; id?: string }
): Promise<BorcSorguSatiri[]> {
  const B = sema.hastaBakiyeHareket;
  const kosullar = [eq(B.tur, "borc")];
  if (secenek.id) kosullar.push(eq(B.id, secenek.id));
  if (secenek.baslangic) kosullar.push(gte(B.createdAt, secenek.baslangic));
  if (secenek.bitis) kosullar.push(lt(B.createdAt, secenek.bitis));

  const sorgu = tx
    .select({
      id: B.id,
      hasta_id: B.hastaId,
      tutar: B.tutar,
      iskonto_tutari: B.iskontoTutari,
      aciklama: B.aciklama,
      created_at: B.createdAt,
      hasta_ad: sema.hasta.adSoyad,
      hasta_eposta: sema.hasta.eposta,
      kimlik_no: sema.hastaHassas.kimlikNo,
      kimlik_no_tipi: sema.hastaHassas.kimlikNoTipi,
      adres: sema.hastaHassas.adres,
      islem_ad: sema.islemTanimi.ad,
      islem_muhasebe: sema.islemTanimi.muhasebeHizmetIsmi,
      islem_kdv: sema.islemTanimi.kdvOrani,
      fatura_id: sema.fatura.id,
      fatura_durum: sema.fatura.durum,
      fatura_hata: sema.fatura.hataMesaji,
      fatura_pdf: sema.fatura.eArsivPdfUrl,
    })
    .from(B)
    .leftJoin(sema.hasta, eq(sema.hasta.id, B.hastaId))
    .leftJoin(sema.hastaHassas, eq(sema.hastaHassas.hastaId, B.hastaId))
    .leftJoin(sema.randevu, eq(sema.randevu.id, B.randevuId))
    .leftJoin(sema.islemTanimi, eq(sema.islemTanimi.id, sema.randevu.islemTanimiId))
    .leftJoin(sema.fatura, eq(sema.fatura.odemeId, B.odemeId))
    .where(and(...kosullar))
    .orderBy(desc(B.createdAt), desc(B.id));
  const satirlar = await (secenek.limit ? sorgu.limit(secenek.limit) : sorgu);

  // Bir ödemeye birden çok fatura bağlanmış olsa da (olmamalı) borç satırı tek kez listelenir.
  const goruldu = new Set<string>();
  const sonuc: BorcSorguSatiri[] = [];
  for (const r of satirlar) {
    if (goruldu.has(r.id)) continue;
    goruldu.add(r.id);
    sonuc.push({
      id: r.id,
      hasta_id: r.hasta_id,
      tutar: tl(r.tutar),
      iskonto_tutari: tl(r.iskonto_tutari),
      aciklama: r.aciklama,
      created_at: r.created_at,
      hasta: r.hasta_ad === null ? null : { ad_soyad: r.hasta_ad, eposta: r.hasta_eposta },
      hassas: r.kimlik_no === null && r.adres === null && r.kimlik_no_tipi === null ? null : { kimlik_no: r.kimlik_no, kimlik_no_tipi: r.kimlik_no_tipi, adres: r.adres },
      islem: r.islem_ad === null ? null : { ad: r.islem_ad, muhasebe_hizmet_ismi: r.islem_muhasebe, kdv_orani: r.islem_kdv ?? "0" },
      fatura: r.fatura_id === null ? null : { id: r.fatura_id, durum: r.fatura_durum as FaturaSatir["durum"], hata_mesaji: r.fatura_hata, e_arsiv_pdf_url: r.fatura_pdf },
    });
  }
  return sonuc;
}

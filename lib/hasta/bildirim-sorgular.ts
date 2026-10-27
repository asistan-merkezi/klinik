// Hastalar > Bildirimler: QR anket yanıtları ve seans sonu değerlendirmeleri (Drizzle). Şekiller types/portal.ts ile aynı.
import { desc, eq } from "drizzle-orm";
import { sema, zamanlariIsoyaCevir, type Tx } from "@/lib/db";
import type { AnketYanitiSatir, SeansDegerlendirmeSatir } from "@/types/portal";

export async function anketYanitlariGetir(tx: Tx, limit = 50): Promise<AnketYanitiSatir[]> {
  const s = await tx
    .select({
      id: sema.anketYaniti.id,
      puan: sema.anketYaniti.puan,
      oneri_metni: sema.anketYaniti.oneriMetni,
      ad_soyad: sema.anketYaniti.adSoyad,
      telefon: sema.anketYaniti.telefon,
      created_at: sema.anketYaniti.createdAt,
      goruldu_tarihi: sema.anketYaniti.gorulduTarihi,
    })
    .from(sema.anketYaniti)
    .orderBy(desc(sema.anketYaniti.createdAt))
    .limit(limit);
  return zamanlariIsoyaCevir(s);
}

export async function seansDegerlendirmeleriGetir(tx: Tx, limit = 50): Promise<SeansDegerlendirmeSatir[]> {
  const s = await tx
    .select({
      id: sema.seansDegerlendirme.id,
      puan: sema.seansDegerlendirme.puan,
      oneri_metni: sema.seansDegerlendirme.oneriMetni,
      created_at: sema.seansDegerlendirme.createdAt,
      goruldu_tarihi: sema.seansDegerlendirme.gorulduTarihi,
      hastaAd: sema.hasta.adSoyad,
      rId: sema.randevu.id,
      rBaslangic: sema.randevu.baslangic,
      terapistAd: sema.personel.adSoyad,
    })
    .from(sema.seansDegerlendirme)
    .leftJoin(sema.hasta, eq(sema.hasta.id, sema.seansDegerlendirme.hastaId))
    .leftJoin(sema.randevu, eq(sema.randevu.id, sema.seansDegerlendirme.randevuId))
    .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
    .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId))
    .orderBy(desc(sema.seansDegerlendirme.createdAt))
    .limit(limit);
  return zamanlariIsoyaCevir(
    s.map((x): SeansDegerlendirmeSatir => ({
      id: x.id,
      puan: x.puan,
      oneri_metni: x.oneri_metni,
      created_at: x.created_at,
      goruldu_tarihi: x.goruldu_tarihi,
      hasta: x.hastaAd == null ? null : { ad_soyad: x.hastaAd },
      randevu: x.rId ? { baslangic: x.rBaslangic!, terapist: x.terapistAd == null ? null : { personel: { ad_soyad: x.terapistAd } } } : null,
    }))
  );
}

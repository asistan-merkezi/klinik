// Zamanlanmış randevu hatırlatmaları (1 gün / 2 saat önce). scripts/bakim/mesaj-kuyruk-isle her turda, klinik başına sistem bağlamında (tx) çağırır.
// Pencerede olan, hâlâ 'planlandi' ve yeterince önceden alınmış randevular için kuyruğa yazar; aynı randevu tekrar taransa da idempotency anahtarı
// tek mesaj bırakır. Mesaj YALNIZ klinik adı + tek kullanımlık bağlantı taşır (lib/mesaj/icerik.ts).
import { and, eq, gt, lte } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";
import { anlikMesajTetikle } from "./anlik-tetikle";
import {
  HATIRLATMA_KURALLARI,
  hatirlatmaEnGecGonderimZamani,
  hatirlatmaGerekliMi,
  hatirlatmaPenceresi,
  randevuMesajAnahtari,
  type RandevuHatirlatmaKodu,
} from "./randevu-hatirlatma-kurali";

export async function randevuHatirlatmalariniTara(tx: Tx, klinikId: string, simdi: Date = new Date()): Promise<{ kod: RandevuHatirlatmaKodu; tarananRandevu: number }[]> {
  const sonuclar: { kod: RandevuHatirlatmaKodu; tarananRandevu: number }[] = [];
  const klinik = (await tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, klinikId)).limit(1))[0];

  for (const kod of Object.keys(HATIRLATMA_KURALLARI) as RandevuHatirlatmaKodu[]) {
    // Aktif kural yoksa bu klinik için yapılacak iş yok.
    const kural = (
      await tx
        .select({ id: sema.mesajKurallari.id })
        .from(sema.mesajKurallari)
        .where(and(eq(sema.mesajKurallari.klinikId, klinikId), eq(sema.mesajKurallari.tetikleyiciKodu, kod), eq(sema.mesajKurallari.aktif, true)))
        .limit(1)
    )[0];
    if (!kural) {
      sonuclar.push({ kod, tarananRandevu: 0 });
      continue;
    }

    const pencere = hatirlatmaPenceresi(kod, simdi);
    const randevular = await tx
      .select({
        id: sema.randevu.id,
        baslangic: sema.randevu.baslangic,
        olusturma: sema.randevu.createdAt,
        durum: sema.randevu.durum,
        iptalTarihi: sema.randevu.iptalTarihi,
        hastaId: sema.hasta.id,
        telefon: sema.hasta.telefon,
        eposta: sema.hasta.eposta,
        wp: sema.hasta.whatsappIzinDurumu,
      })
      .from(sema.randevu)
      .innerJoin(sema.hasta, eq(sema.hasta.id, sema.randevu.hastaId))
      .where(and(eq(sema.randevu.klinikId, klinikId), eq(sema.randevu.durum, "planlandi"), gt(sema.randevu.baslangic, pencere.alt), lte(sema.randevu.baslangic, pencere.ust)))
      .limit(500);

    const uygun = randevular.filter((r) => hatirlatmaGerekliMi(kod, { created_at: new Date(r.olusturma).toISOString(), baslangic: r.baslangic }));
    for (const r of uygun) {
      try {
        await anlikMesajTetikle(tx, {
          klinikId,
          tetikleyiciKodu: kod,
          aliciTipi: "hasta",
          aliciId: r.hastaId,
          adres: { telefon: r.telefon, eposta: r.eposta, whatsappIzni: r.wp },
          klinikAdi: klinik?.ad ?? "",
          idempotencyTemeli: randevuMesajAnahtari(kod, { id: r.id, baslangic: r.baslangic, durum: r.durum, iptal_tarihi: r.iptalTarihi }),
          enGecGonderimZamani: hatirlatmaEnGecGonderimZamani(kod, r.baslangic),
        });
      } catch (hata) {
        console.error(`[mesaj] hatırlatma yazılamadı (${kod}, randevu ${r.id}):`, hata);
      }
    }
    sonuclar.push({ kod, tarananRandevu: uygun.length });
  }
  return sonuclar;
}

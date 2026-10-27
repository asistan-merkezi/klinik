import { and, desc, eq } from "drizzle-orm";
import { sema, withTenant, type TenantBaglami, type Tx } from "@/lib/db";
import { anlikMesajTetikle } from "./anlik-tetikle";
import { hosgeldinAnahtari, odemeAlindiAnahtari, paketSatisOzetiAnahtari, paketSatisTazeMi, tutarMetni } from "./hasta-mesaji-kurali";

// Bu fonksiyonlar kullanıcı isteğinden doğan olaylar içindir (after() ile çağrılır): çağıranın tenant bağlamı (`bag`) ile kendi withTenant'ını açar.

async function hastaVeKlinikAdi(tx: Tx, hastaId: string) {
  const hasta = (
    await tx
      .select({ id: sema.hasta.id, klinikId: sema.hasta.klinikId, adSoyad: sema.hasta.adSoyad, telefon: sema.hasta.telefon, eposta: sema.hasta.eposta, whatsappIzinDurumu: sema.hasta.whatsappIzinDurumu })
      .from(sema.hasta)
      .where(eq(sema.hasta.id, hastaId))
      .limit(1)
  )[0];
  if (!hasta) return null;
  const klinik = (await tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, hasta.klinikId)).limit(1))[0];
  return { hasta, klinikAdi: klinik?.ad ?? "" };
}

const adres = (h: { telefon: string | null; eposta: string | null; whatsappIzinDurumu: boolean }) => ({ telefon: h.telefon, eposta: h.eposta, whatsappIzni: h.whatsappIzinDurumu });

/**
 * Resepsiyonun oluşturduğu yeni hastaya hoş geldin mesajı. QR self-servis kaydına BİLİNÇLİ bağlı değil:
 * form anonim ve telefon doğrulanmıyor — başkasının numarası yazılarak klinik kredisiyle SMS attırılabilirdi.
 * Best-effort: hata asla kayıt işlemini bozmaz.
 */
export async function hastaHosgeldinTetikle(bag: TenantBaglami, hastaId: string): Promise<void> {
  try {
    await withTenant(bag, async (tx) => {
      const b = await hastaVeKlinikAdi(tx, hastaId);
      if (!b) return;
      await anlikMesajTetikle(tx, {
        klinikId: b.hasta.klinikId,
        tetikleyiciKodu: "hasta_kayit_hosgeldin",
        aliciTipi: "hasta",
        aliciId: b.hasta.id,
        adres: adres(b.hasta),
        degiskenler: { hasta_adi: b.hasta.adSoyad, klinik_adi: b.klinikAdi },
        idempotencyTemeli: hosgeldinAnahtari(b.hasta.id),
      });
    });
  } catch (hata) {
    console.error(`[mesaj] hoş geldin mesajı yazılamadı (hasta ${hastaId}):`, hata);
  }
}

/**
 * Paket satışı sonrası özet mesajı: her satılan paket için, hastanın o paketten EN SON (son 2 dk içinde)
 * oluşan satışı okunur — gerçek kalan_adet mesajda seans sayısı olur. Satış satırı id'si idempotency
 * anahtarıdır. Best-effort.
 */
export async function paketSatisOzetiMesajiTetikle(bag: TenantBaglami, hastaId: string, paketIdler: string[]): Promise<void> {
  try {
    await withTenant(bag, async (tx) => {
      const b = await hastaVeKlinikAdi(tx, hastaId);
      if (!b) return;
      for (const paketId of [...new Set(paketIdler)]) {
        const satis = (
          await tx
            .select({ id: sema.paketSatis.id, kalanAdet: sema.paketSatis.kalanAdet, createdAt: sema.paketSatis.createdAt, paketAd: sema.paket.ad })
            .from(sema.paketSatis)
            .leftJoin(sema.paket, eq(sema.paket.id, sema.paketSatis.paketId))
            .where(and(eq(sema.paketSatis.hastaId, hastaId), eq(sema.paketSatis.paketId, paketId)))
            .orderBy(desc(sema.paketSatis.createdAt))
            .limit(1)
        )[0];
        if (!satis || !paketSatisTazeMi(new Date(satis.createdAt).toISOString())) continue;
        await anlikMesajTetikle(tx, {
          klinikId: b.hasta.klinikId,
          tetikleyiciKodu: "hasta_paket_satis_ozet",
          aliciTipi: "hasta",
          aliciId: b.hasta.id,
          adres: adres(b.hasta),
          degiskenler: { hasta_adi: b.hasta.adSoyad, paket_adi: satis.paketAd ?? "Paket", seans_sayisi: String(satis.kalanAdet), klinik_adi: b.klinikAdi },
          idempotencyTemeli: paketSatisOzetiAnahtari(satis.id),
        });
      }
    });
  } catch (hata) {
    console.error(`[mesaj] paket satış özeti yazılamadı (hasta ${hastaId}):`, hata);
  }
}

/** Hastadan ödeme alındığında (iade değil) teşekkür/makbuz mesajı. Best-effort. */
export async function odemeAlindiMesajiTetikle(
  bag: TenantBaglami,
  hastaId: string,
  tutar: number,
  kaynak: { hareketId: string } | { randevuId: string }
): Promise<void> {
  try {
    await withTenant(bag, async (tx) => {
      const b = await hastaVeKlinikAdi(tx, hastaId);
      if (!b) return;
      await anlikMesajTetikle(tx, {
        klinikId: b.hasta.klinikId,
        tetikleyiciKodu: "muhasebe_odeme_alindi",
        aliciTipi: "hasta",
        aliciId: b.hasta.id,
        adres: adres(b.hasta),
        degiskenler: { hasta_adi: b.hasta.adSoyad, tutar: tutarMetni(tutar), klinik_adi: b.klinikAdi },
        idempotencyTemeli: odemeAlindiAnahtari(kaynak),
      });
    });
  } catch (hata) {
    console.error(`[mesaj] ödeme alındı mesajı yazılamadı (hasta ${hastaId}):`, hata);
  }
}

import { eq } from "drizzle-orm";
import { sema, withTenant, type TenantBaglami, type Tx } from "@/lib/db";
import { anlikMesajTetikle } from "./anlik-tetikle";
import { randevuMesajAnahtari, type RandevuOlayKodu } from "./randevu-hatirlatma-kurali";

// Hatırlatma taraması için bkz. randevu-hatirlatma-tarama.ts (scripts/bakim/mesaj-kuyruk-isle).

type RandevuMesajSatiri = {
  id: string;
  klinikId: string;
  baslangic: string;
  durum: string;
  iptalTarihi: string | null;
  hasta: { id: string; adSoyad: string; telefon: string | null; eposta: string | null; whatsappIzinDurumu: boolean } | null;
  terapistAdi: string;
  klinikAdi: string;
};

async function randevuMesajSatiri(tx: Tx, randevuId: string): Promise<RandevuMesajSatiri | null> {
  const r = (
    await tx
      .select({
        id: sema.randevu.id,
        klinikId: sema.randevu.klinikId,
        baslangic: sema.randevu.baslangic,
        durum: sema.randevu.durum,
        iptalTarihi: sema.randevu.iptalTarihi,
        hastaId: sema.hasta.id,
        hastaAd: sema.hasta.adSoyad,
        hastaTelefon: sema.hasta.telefon,
        hastaEposta: sema.hasta.eposta,
        hastaWp: sema.hasta.whatsappIzinDurumu,
        terapistAd: sema.personel.adSoyad,
      })
      .from(sema.randevu)
      .leftJoin(sema.hasta, eq(sema.hasta.id, sema.randevu.hastaId))
      .leftJoin(sema.terapist, eq(sema.terapist.id, sema.randevu.terapistId))
      .leftJoin(sema.personel, eq(sema.personel.id, sema.terapist.personelId))
      .where(eq(sema.randevu.id, randevuId))
      .limit(1)
  )[0];
  if (!r) return null;
  const klinik = (await tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, r.klinikId)).limit(1))[0];
  return {
    id: r.id,
    klinikId: r.klinikId,
    baslangic: r.baslangic,
    durum: r.durum,
    iptalTarihi: r.iptalTarihi,
    hasta: r.hastaId ? { id: r.hastaId, adSoyad: r.hastaAd ?? "", telefon: r.hastaTelefon, eposta: r.hastaEposta, whatsappIzinDurumu: Boolean(r.hastaWp) } : null,
    terapistAdi: r.terapistAd ?? "",
    klinikAdi: klinik?.ad ?? "",
  };
}

async function satiriKuyrugaYaz(
  tx: Tx,
  kod: RandevuOlayKodu,
  r: RandevuMesajSatiri,
  anahtarSatiri: { baslangic: string; durum?: string | null; iptal_tarihi?: string | null }
): Promise<void> {
  if (!r.hasta) return;
  await anlikMesajTetikle(tx, {
    klinikId: r.klinikId,
    tetikleyiciKodu: kod,
    aliciTipi: "hasta",
    aliciId: r.hasta.id,
    adres: { telefon: r.hasta.telefon, eposta: r.hasta.eposta, whatsappIzni: r.hasta.whatsappIzinDurumu },
    klinikAdi: r.klinikAdi,
    idempotencyTemeli: randevuMesajAnahtari(kod, { id: r.id, ...anahtarSatiri }),
  });
}

/**
 * Bir randevu OLAYI (oluşturma/iptal/erteleme/gelmedi) sonrası hastaya hizmet mesajını kuyruğa yazar.
 * `bag` çağıranın (oturumlu personel) tenant bağlamıdır; `after()` içinde kendi withTenant'ı açılır (istek transaction'ı bitmiştir).
 * Best-effort: hata asla çağıran işlemi bozmaz, yalnız loglanır. Kural yoksa/pasifse ya da hastanın adresi yoksa sessizce atlanır.
 */
export async function randevuOlayMesajiTetikle(
  bag: TenantBaglami,
  randevuId: string,
  kod: "randevu_onay" | "randevu_iptal" | "randevu_gelmedi"
): Promise<void> {
  try {
    await withTenant(bag, async (tx) => {
      const data = await randevuMesajSatiri(tx, randevuId);
      if (!data) return;
      if (kod === "randevu_iptal") {
        await satiriKuyrugaYaz(
          tx,
          kod,
          data,
          // Anahtar: erteleme için YENİ saat (her erteleme ayrı bildirim), iptal için iptal zamanı.
          { baslangic: data.baslangic, durum: data.durum, iptal_tarihi: data.iptalTarihi }
        );
        return;
      }
      await satiriKuyrugaYaz(tx, kod, data, { baslangic: data.baslangic, durum: data.durum, iptal_tarihi: data.iptalTarihi });
    });
  } catch (hata) {
    console.error(`[mesaj] randevu mesajı kuyruğa yazılamadı (${kod}, randevu ${randevuId}):`, hata);
  }
}

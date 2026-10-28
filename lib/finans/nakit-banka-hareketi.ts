import { eq } from "drizzle-orm";
import { pgHata, sema, type Tx } from "@/lib/db";
import { kurusMetni } from "@/lib/para";
import type { NakitBankaHareketTipi, NakitBankaOdemeYontemi } from "@/types/nakit-banka-hareketi";

/**
 * Kasa ve Banka sayfalarının "Giren/Çıkan/Hesaplar Arası" formları aynı
 * tabloya (nakit_banka_hareketi) yazıyor — CHECK constraint'lerin beklediği
 * kaynak/hedef kombinasyonunu kurmak tek yerde, iki actions.ts dosyası da
 * (kasa, banka) bunu çağırıyor. Tutar KURUŞ (tamsayı) olarak gelir.
 */
export type NakitBankaHareketiGirdisi = {
  tip: NakitBankaHareketTipi;
  kaynakKasa: boolean;
  kaynakBankaHesapId: string | null;
  hedefKasa: boolean;
  hedefBankaHesapId: string | null;
  odemeYontemi: NakitBankaOdemeYontemi | null;
  karsiTarafAdi: string | null;
  karsiTarafBanka: string | null;
  karsiTarafIban: string | null;
  aciklama: string | null;
  tutarKurus: number;
  tarih: string;
};

export async function nakitBankaHareketiOlustur(
  tx: Tx,
  klinikId: string,
  kullaniciId: string,
  girdi: NakitBankaHareketiGirdisi
): Promise<{ error: string | null }> {
  try {
    await tx.insert(sema.nakitBankaHareketi).values({
      klinikId,
      tip: girdi.tip,
      kaynakKasa: girdi.kaynakKasa,
      kaynakBankaHesapId: girdi.kaynakBankaHesapId,
      hedefKasa: girdi.hedefKasa,
      hedefBankaHesapId: girdi.hedefBankaHesapId,
      odemeYontemi: girdi.odemeYontemi,
      karsiTarafAdi: girdi.karsiTarafAdi,
      karsiTarafBanka: girdi.karsiTarafBanka,
      karsiTarafIban: girdi.karsiTarafIban,
      aciklama: girdi.aciklama,
      tutar: kurusMetni(girdi.tutarKurus),
      tarih: girdi.tarih,
      ekleyenKullaniciId: kullaniciId,
    });
  } catch (e) {
    console.error("Nakit/banka hareketi eklenemedi:", pgHata(e).mesaj);
    return { error: "Kaydedilemedi, lütfen tekrar deneyin." };
  }
  return { error: null };
}

export async function nakitBankaHareketiSil(tx: Tx, id: string): Promise<{ error: string | null; silinen: number }> {
  try {
    const r = await tx.delete(sema.nakitBankaHareketi).where(eq(sema.nakitBankaHareketi.id, id)).returning({ id: sema.nakitBankaHareketi.id });
    return { error: null, silinen: r.length };
  } catch (e) {
    console.error("Nakit/banka hareketi silinemedi:", pgHata(e).mesaj);
    return { error: "Silinemedi, lütfen tekrar deneyin.", silinen: 0 };
  }
}

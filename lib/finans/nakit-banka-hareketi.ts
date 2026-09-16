import type { SupabaseClient } from "@supabase/supabase-js";
import type { NakitBankaHareketTipi, NakitBankaOdemeYontemi } from "@/types/nakit-banka-hareketi";

/**
 * Kasa ve Banka sayfalarının "Giren/Çıkan/Hesaplar Arası" formları aynı
 * tabloya (nakit_banka_hareketi) yazıyor — CHECK constraint'lerin beklediği
 * kaynak/hedef kombinasyonunu kurmak tek yerde, iki actions.ts dosyası da
 * (kasa, banka) bunu çağırıyor.
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
  tutar: number;
  tarih: string;
};

export async function nakitBankaHareketiOlustur(
  supabase: SupabaseClient,
  klinikId: string,
  kullaniciId: string,
  girdi: NakitBankaHareketiGirdisi
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("nakit_banka_hareketi").insert({
    klinik_id: klinikId,
    tip: girdi.tip,
    kaynak_kasa: girdi.kaynakKasa,
    kaynak_banka_hesap_id: girdi.kaynakBankaHesapId,
    hedef_kasa: girdi.hedefKasa,
    hedef_banka_hesap_id: girdi.hedefBankaHesapId,
    odeme_yontemi: girdi.odemeYontemi,
    karsi_taraf_adi: girdi.karsiTarafAdi,
    karsi_taraf_banka: girdi.karsiTarafBanka,
    karsi_taraf_iban: girdi.karsiTarafIban,
    aciklama: girdi.aciklama,
    tutar: girdi.tutar,
    tarih: girdi.tarih,
    ekleyen_kullanici_id: kullaniciId,
  });

  if (error) {
    console.error("Nakit/banka hareketi eklenemedi:", error);
    return { error: "Kaydedilemedi, lütfen tekrar deneyin." };
  }
  return { error: null };
}

export async function nakitBankaHareketiSil(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("nakit_banka_hareketi").delete().eq("id", id);
  if (error) {
    console.error("Nakit/banka hareketi silinemedi:", error);
    return { error: "Silinemedi, lütfen tekrar deneyin." };
  }
  return { error: null };
}

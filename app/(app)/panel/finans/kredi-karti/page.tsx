import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { KrediKartiLedger } from "./kredi-karti-ledger";

// tur='iade' satırları (hasta kart iadesi) aynı sorguyla gelir; burada ÇIKIŞ sayılır.
type HastaOdemeSatiri = { id: string; created_at: string; tutar: number; tur: string; hasta: { ad_soyad: string } | null };
type HarcamaSatiri = { id: string; tarih: string; tutar: number; tedarikci_adi: string | null; kategori: string };

/**
 * Kredi kartı üçüncü bir ödeme rayı (nakit/havale'nin yanında) ama Kasa
 * sadece odeme_yontemi='nakit', Banka sadece 'banka_havalesi' okuyordu —
 * kredi kartıyla alınan tahsilat/yapılan gider hasta cari kaydına ve
 * klinik_harcama'ya doğru düşüyordu ama hiçbir mutabakat ekranında
 * görünmüyordu (kullanıcı sorusu: "kredi kartıyla tahsilat nereye kayıt
 * alınıyor" — canlı testte doğrulandı). Kasa/Banka'nın aksine burada manuel
 * hareket girişi YOK: nakit_banka_hareketi şeması kart bacağı taşımıyor,
 * kart için "elden" bir kasa kavramı da yok — salt okunur mutabakat yeterli.
 */
export default async function KrediKartiSayfasi({ searchParams }: { searchParams: Promise<{ yil?: string }> }) {
  const { yil: yilParam } = await searchParams;
  const simdikiYil = new Date().getFullYear();
  const secilenYil = yilParam && /^\d{4}$/.test(yilParam) ? Number(yilParam) : simdikiYil;
  const yilBaslangicTarih = `${secilenYil}-01-01`;
  const yilBitisTarih = `${secilenYil + 1}-01-01`;
  const yilBaslangicTs = `${yilBaslangicTarih}T00:00:00.000Z`;
  const yilBitisTs = `${yilBitisTarih}T00:00:00.000Z`;

  await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const supabase = await createClient();

  const [hastaOdemeSonucu, harcamaSonucu, oncekiToplamSonucu] = await Promise.all([
    supabase
      .from("hasta_bakiye_hareket")
      .select("id, created_at, tutar, tur, hasta:hasta_id(ad_soyad)")
      .in("tur", ["odeme", "iade"])
      .eq("odeme_yontemi", "kredi_karti")
      .gte("created_at", yilBaslangicTs)
      .lt("created_at", yilBitisTs)
      .returns<HastaOdemeSatiri[]>(),
    supabase
      .from("klinik_harcama")
      .select("id, tarih, tutar, tedarikci_adi, kategori")
      .eq("odeme_tipi", "kredi_karti")
      .gte("tarih", yilBaslangicTarih)
      .lt("tarih", yilBitisTarih)
      .returns<HarcamaSatiri[]>(),
    supabase.rpc("kredi_karti_bakiye_once_toplam", { p_once_tarih: yilBaslangicTarih }),
  ]);

  const gelenRows: LedgerSatiri[] = (hastaOdemeSonucu.data ?? [])
    .filter((h) => h.tur === "odeme")
    .map((h) => ({
      tarih: h.created_at.slice(0, 10),
      tutar: h.tutar,
      etiket: "Hasta ödemesi",
      taraf: h.hasta?.ad_soyad ?? "Hasta",
    }));

  const gidenRows: LedgerSatiri[] = [
    ...(hastaOdemeSonucu.data ?? [])
      .filter((h) => h.tur === "iade")
      .map((h) => ({
        tarih: h.created_at.slice(0, 10),
        tutar: h.tutar,
        etiket: "Hasta iadesi",
        taraf: h.hasta?.ad_soyad ?? "Hasta",
      })),
    ...(harcamaSonucu.data ?? []).map((g) => ({
      tarih: g.tarih,
      tutar: g.tutar,
      etiket: g.tedarikci_adi ?? g.kategori,
      taraf: g.tedarikci_adi ?? undefined,
    })),
  ];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Kredi Kartı"
          description="POS ile alınan tahsilatlar ve kartla yapılan giderlerin mutabakatı."
          icon={CreditCard}
        />

        <KrediKartiLedger
          gelenRows={gelenRows}
          gidenRows={gidenRows}
          openingBalance={oncekiToplamSonucu.data ?? 0}
          yil={secilenYil}
        />
      </div>
    </div>
  );
}

import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateForInput } from "@/lib/datetime";
import { finansDonemiCoz } from "@/lib/finans/donem";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-okuma";
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
export default async function KrediKartiSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string; yil?: string; ay?: string }>;
}) {
  const donem = finansDonemiCoz(await searchParams);

  await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const supabase = await createClient();

  // Her liste 1000'lik sayfalarla okunur (PostgREST max_rows sessiz kesmesin); sıralama sabit (tarih + id).
  const [hastaOdemeleri, harcamalar, oncekiToplamSonucu] = await Promise.all([
    tumSayfalariOku((bas, son) =>
      supabase
        .from("hasta_bakiye_hareket")
        .select("id, created_at, tutar, tur, hasta:hasta_id(ad_soyad)")
        .in("tur", ["odeme", "iade"])
        .eq("odeme_yontemi", "kredi_karti")
        .gte("created_at", donem.baslangicTs)
        .lt("created_at", donem.bitisTs)
        .order("created_at")
        .order("id")
        .range(bas, son)
        .returns<HastaOdemeSatiri[]>()
    ),
    tumSayfalariOku((bas, son) =>
      supabase
        .from("klinik_harcama")
        .select("id, tarih, tutar, tedarikci_adi, kategori")
        .eq("odeme_tipi", "kredi_karti")
        .gte("tarih", donem.baslangic)
        .lt("tarih", donem.bitis)
        .order("tarih")
        .order("id")
        .range(bas, son)
        .returns<HarcamaSatiri[]>()
    ),
    supabase.rpc("kredi_karti_bakiye_once_toplam", { p_once_tarih: donem.baslangic }),
  ]);
  if (oncekiToplamSonucu.error) throw new Error(oncekiToplamSonucu.error.message);

  const gelenRows: LedgerSatiri[] = hastaOdemeleri
    .filter((h) => h.tur === "odeme")
    .map((h) => ({
      id: h.id,
      tarih: formatDateForInput(h.created_at),
      tutar: h.tutar,
      etiket: "Hasta ödemesi",
      taraf: h.hasta?.ad_soyad ?? "Hasta",
    }));

  const gidenRows: LedgerSatiri[] = [
    ...hastaOdemeleri
      .filter((h) => h.tur === "iade")
      .map((h) => ({
        id: h.id,
        tarih: formatDateForInput(h.created_at),
        tutar: h.tutar,
        etiket: "Hasta iadesi",
        taraf: h.hasta?.ad_soyad ?? "Hasta",
      })),
    ...harcamalar.map((g) => ({
      id: g.id,
      tarih: g.tarih,
      tutar: g.tutar,
      etiket: "Gider",
      taraf: g.tedarikci_adi ?? undefined,
      aciklama: g.tedarikci_adi ? g.kategori : undefined,
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
          openingBalance={Number(oncekiToplamSonucu.data ?? 0)}
          mod={donem.mod}
          yil={donem.yil}
          ay={donem.ay}
        />
      </div>
    </div>
  );
}

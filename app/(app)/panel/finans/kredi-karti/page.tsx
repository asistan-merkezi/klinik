import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import { bugunIstanbulTarihi, formatDateForInput } from "@/lib/datetime";
import { finansDonemiCoz } from "@/lib/finans/donem";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-okuma";
import type { KlinikBankaHesabi, KlinikKrediKarti } from "@/types/klinik";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { KrediKartiLedger } from "./kredi-karti-ledger";
import { KartBorclari, type KartHareketi, type KartOzeti } from "./kart-borclari";

// tur='iade' satırları (hasta kart iadesi) aynı sorguyla gelir; burada ÇIKIŞ sayılır.
type HastaOdemeSatiri = { id: string; created_at: string; tutar: number; tur: string; hasta: { ad_soyad: string } | null };
type HarcamaSatiri = { id: string; tarih: string; tutar: number; tedarikci_adi: string | null; kategori: string };
type CariOdemeSatiri = { id: string; tarih: string; tutar: number; tedarikci_adi: string; aciklama: string | null };

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
  searchParams: Promise<{ mod?: string; yil?: string; ay?: string; tum?: string }>;
}) {
  const sp = await searchParams;
  const donem = finansDonemiCoz(sp);
  const tumZamanlar = sp.tum === "1";

  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const supabase = await createClient();
  const duzenlenebilir = kullanici.rol === "klinik_admin";
  const klinikId = kullanici.klinik_id ?? "";

  // Kart hareket listesi varsayılan SON 12 AY (yıllar sonra da hafif); borç her zaman tüm zamanlar (SQL toplamı).
  const [bugunYil, bugunAy, bugunGun] = bugunIstanbulTarihi().split("-");
  const hareketBaslangici = `${Number(bugunYil) - 1}-${bugunAy}-${bugunGun}`;

  // Her liste 1000'lik sayfalarla okunur (PostgREST max_rows sessiz kesmesin); sıralama sabit (tarih + id).
  const [
    hastaOdemeleri,
    harcamalar,
    cariOdemeleri,
    oncekiToplamSonucu,
    kartSonucu,
    bankaSonucu,
    ozetSonucu,
    kartHareketleri,
  ] = await Promise.all([
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
    // Kartla yapılan cari ödemesi de (kartla yapılan gider gibi) bu rayda çıkıştır.
    tumSayfalariOku((bas, son) =>
      supabase
        .from("klinik_cari_odeme")
        .select("id, tarih, tutar, tedarikci_adi, aciklama")
        .eq("odeme_tipi", "kredi_karti")
        .gte("tarih", donem.baslangic)
        .lt("tarih", donem.bitis)
        .order("tarih")
        .order("id")
        .range(bas, son)
        .returns<CariOdemeSatiri[]>()
    ),
    supabase.rpc("kredi_karti_bakiye_once_toplam", { p_once_tarih: donem.baslangic }),
    supabase
      .from("klinik_kredi_kartlari")
      .select("id, kart_tipi, kart_adi, banka_adi, kart_sahibi, son_dort_hane")
      .order("sort_order")
      .returns<KlinikKrediKarti[]>(),
    supabase
      .from("klinik_banka_hesaplari")
      .select("id, banka_adi, sube")
      .order("sort_order")
      .returns<KlinikBankaHesabi[]>(),
    supabase.rpc("kredi_karti_borc_ozetleri", { p_klinik_id: klinikId }),
    tumSayfalariOku((bas, son) => {
      let sorgu = supabase
        .from("klinik_kredi_karti_hareketleri")
        .select("kaynak, id, kredi_karti_id, tarih, tip, tutar, ad, detay, yontem, banka_hesap_id");
      if (!tumZamanlar) sorgu = sorgu.gte("tarih", hareketBaslangici);
      return sorgu
        .order("tarih", { ascending: false })
        .order("kaynak")
        .order("id")
        .range(bas, son)
        .returns<KartHareketi[]>();
    }),
  ]);
  if (oncekiToplamSonucu.error) throw new Error(oncekiToplamSonucu.error.message);
  if (ozetSonucu.error) throw new Error(ozetSonucu.error.message);

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
    ...cariOdemeleri.map((c) => ({
      id: c.id,
      tarih: c.tarih,
      tutar: c.tutar,
      etiket: "Tedarikçi ödemesi",
      taraf: c.tedarikci_adi,
      aciklama: c.aciklama ?? undefined,
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
          description="Kartla yapılan giderlerin takibi."
          icon={CreditCard}
        />

        <KartBorclari
          kartlar={kartSonucu.data ?? []}
          ozetler={((ozetSonucu.data ?? []) as KartOzeti[]).map((o) => ({
            kredi_karti_id: o.kredi_karti_id,
            harcama: Number(o.harcama),
            odeme: Number(o.odeme),
          }))}
          hareketler={kartHareketleri.map((h) => ({ ...h, tutar: Number(h.tutar) }))}
          bankaHesaplari={bankaSonucu.data ?? []}
          duzenlenebilir={duzenlenebilir}
          tumZamanlar={tumZamanlar}
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

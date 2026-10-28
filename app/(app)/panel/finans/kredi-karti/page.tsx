import { CreditCard } from "lucide-react";
import { withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import { bugunIstanbulTarihi, formatDateForInput } from "@/lib/datetime";
import { finansDonemiCoz } from "@/lib/finans/donem";
import {
  bankaHesaplariniGetir,
  cariOdemeleriniGetir,
  harcamalariGetir,
  hastaOdemeleriniGetir,
  kartBorcOzetleriniGetir,
  kartHareketleriniGetir,
  krediKartiDonemBasiBakiyesi,
  krediKartlariniGetir,
} from "@/lib/finans/okuma";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { KrediKartiLedger } from "./kredi-karti-ledger";
import { KartBorclari } from "./kart-borclari";

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
  const duzenlenebilir = kullanici.rol === "klinik_admin";
  const { bag } = await panelBaglami();

  // Kart hareket listesi varsayılan SON 12 AY (yıllar sonra da hafif); borç her zaman tüm zamanlar (SQL toplamı).
  const [bugunYil, bugunAy, bugunGun] = bugunIstanbulTarihi().split("-");
  const hareketBaslangici = `${Number(bugunYil) - 1}-${bugunAy}-${bugunGun}`;

  const v = await withTenant(bag, async (tx) => ({
    hastaOdemeleri: await hastaOdemeleriniGetir(tx, donem, ["kredi_karti"]),
    harcamalar: await harcamalariGetir(tx, donem, "kredi_karti"),
    // Kartla yapılan cari ödemesi de (kartla yapılan gider gibi) bu rayda çıkıştır.
    cariOdemeleri: await cariOdemeleriniGetir(tx, donem, "kredi_karti"),
    oncekiToplam: await krediKartiDonemBasiBakiyesi(tx, donem),
    kartlar: await krediKartlariniGetir(tx),
    bankaHesaplari: await bankaHesaplariniGetir(tx),
    ozetler: await kartBorcOzetleriniGetir(tx, bag.tenantId),
    kartHareketleri: await kartHareketleriniGetir(tx, tumZamanlar ? null : hareketBaslangici),
  }));
  const { hastaOdemeleri, harcamalar, cariOdemeleri } = v;

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
          kartlar={v.kartlar}
          ozetler={v.ozetler}
          hareketler={v.kartHareketleri}
          bankaHesaplari={v.bankaHesaplari}
          duzenlenebilir={duzenlenebilir}
          tumZamanlar={tumZamanlar}
        />

        <KrediKartiLedger
          gelenRows={gelenRows}
          gidenRows={gidenRows}
          openingBalance={v.oncekiToplam}
          mod={donem.mod}
          yil={donem.yil}
          ay={donem.ay}
        />
      </div>
    </div>
  );
}

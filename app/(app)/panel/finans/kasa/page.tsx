import { Banknote } from "lucide-react";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateForInput } from "@/lib/datetime";
import { finansDonemiCoz } from "@/lib/finans/donem";
import { tlTopla } from "@/lib/para";
import {
  aktifPersoneliGetir,
  araclariGetir,
  bankaHesaplariniGetir,
  cariOdemeleriniGetir,
  dengelemeleriGetir,
  harcamalariGetir,
  hastaOdemeleriniGetir,
  kamusalOdemeleriniGetir,
  kartOdemeleriniGetir,
  kasaDonemBasiBakiyesi,
  krediKartlariniGetir,
  nakitBankaHareketleriniGetir,
  personelOdemeleriniGetir,
  type DengelemeSatiri,
} from "@/lib/finans/okuma";
import { ODEME_TIPI_ETIKET, type OdemeTipi } from "@/types/kamusal-odeme";
import { PageHeader } from "@/components/ui/page-header";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { KasaClient, type KasaKontrolBilgisi } from "./kasa-client";

type KasaAyari = { baslangic_tutari?: number; baslangic_zamani?: string; baslangic_giren?: string };

export default async function KasaSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string; yil?: string; ay?: string }>;
}) {
  const donem = finansDonemiCoz(await searchParams);

  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const { bag } = await panelBaglami();

  const duzenlenebilir = kullanici.rol === "klinik_admin";

  // Yalnız SEÇİLİ dönemin satırları; sıralama sabit (tarih + id). Dönem başı bakiye satır çekmeden SQL'den (kasa_bakiye_once_toplam) gelir.
  const v = await withTenant(bag, async (tx) => ({
    ayarlar: (await tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, bag.tenantId)).limit(1))[0]?.ayarlar,
    hastaOdemeleri: await hastaOdemeleriniGetir(tx, donem, ["nakit"]),
    harcamalar: await harcamalariGetir(tx, donem, "nakit"),
    // Tedarikçi cari ödemesi (nakit) ve karta yapılan nakit ödeme kasadan ÇIKIŞ olur.
    cariOdemeleri: await cariOdemeleriniGetir(tx, donem, "nakit"),
    kartOdemeleri: await kartOdemeleriniGetir(tx, donem, "nakit"),
    personelOdemeleri: await personelOdemeleriniGetir(tx, donem, "nakit"),
    nakitBankaHareketleri: await nakitBankaHareketleriniGetir(tx, donem, "kasa"),
    kamusalOdemeleri: await kamusalOdemeleriniGetir(tx, donem, "nakit"),
    dengelemeler: await dengelemeleriGetir(tx, donem),
    bankaHesaplari: await bankaHesaplariniGetir(tx),
    personelListesi: await aktifPersoneliGetir(tx),
    araclar: await araclariGetir(tx),
    kartlar: await krediKartlariniGetir(tx),
    oncekiToplam: await kasaDonemBasiBakiyesi(tx, donem),
  }));
  const { hastaOdemeleri, harcamalar, cariOdemeleri, kartOdemeleri, personelOdemeleri, nakitBankaHareketleri, kamusalOdemeleri, dengelemeler } = v;

  const kasaAyari = (v.ayarlar as { kasa?: KasaAyari } | null | undefined)?.kasa ?? {};
  const baslangicTutari = kasaAyari.baslangic_tutari ?? 0;
  const baslangicZamani = kasaAyari.baslangic_zamani ?? null;
  const baslangicGunu = baslangicZamani ? formatDateForInput(baslangicZamani) : null;

  // Başlangıç tutarı: giriş zamanı YOKSA (eski kayıt) her dönemin açılışıdır. Zamanı varsa
  // girildiği günden itibaren sayılır — o günden önceki dönemlerde 0, o dönemde "Kasa Başlangıç"
  // hareketi, sonraki dönemlerde açılış bakiyesine dahil.
  let donemBaslangicBakiyesi = v.oncekiToplam;
  let baslangicHareketi: LedgerSatiri | null = null;
  if (baslangicTutari > 0) {
    if (!baslangicGunu || baslangicGunu < donem.baslangic) {
      donemBaslangicBakiyesi = tlTopla([donemBaslangicBakiyesi, baslangicTutari]);
    } else if (baslangicGunu < donem.bitis) {
      baslangicHareketi = {
        id: "kasa-baslangic",
        tarih: baslangicGunu,
        tutar: baslangicTutari,
        etiket: "Kasa Başlangıç",
        taraf: kasaAyari.baslangic_giren,
      };
    }
  }

  // Yön her zaman kaynak/hedef BAYRAĞINA göre (tip'e göre değil): tip='gelen' kayıtta para giren
  // hesap hedef_kasa'dır, kaynak boştur. SQL tarafı (kasa_bakiye_once_toplam) aynı kuralı kullanır.
  const gelenRows: LedgerSatiri[] = [
    ...(baslangicHareketi ? [baslangicHareketi] : []),
    ...hastaOdemeleri
      .filter((h) => h.tur === "odeme")
      .map((h) => ({
        id: h.id,
        tarih: formatDateForInput(h.created_at),
        tutar: h.tutar,
        etiket: "Hasta ödemesi",
        taraf: h.hasta?.ad_soyad ?? "Hasta",
      })),
    ...nakitBankaHareketleri
      .filter((n) => n.hedef_kasa)
      .map((n) => ({
        id: n.id,
        tarih: n.tarih,
        tutar: n.tutar,
        etiket: n.tip === "hesaplar_arasi" ? "Bankadan transfer" : "Kasaya giren",
        taraf: n.karsi_taraf_adi ?? undefined,
        aciklama: n.aciklama ?? undefined,
        sil: { hedef: "nakit_banka_hareketi" as const, id: n.id },
      })),
    ...dengelemeler
      .filter((d) => d.tutar > 0)
      .map((d) => dengelemeSatiri(d, d.tutar)),
  ];

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
    ...cariOdemeleri.map((c) => ({
      id: c.id,
      tarih: c.tarih,
      tutar: c.tutar,
      etiket: "Tedarikçi ödemesi",
      taraf: c.tedarikci_adi,
      aciklama: c.aciklama ?? undefined,
    })),
    ...kartOdemeleri.map((k) => ({
      id: k.id,
      tarih: k.tarih,
      tutar: k.tutar,
      etiket: "Kredi kartı ödemesi",
      taraf: k.kart?.kart_adi ?? "Kredi kartı",
      aciklama: k.aciklama ?? undefined,
    })),
    ...personelOdemeleri.map((p) => ({
      id: p.id,
      tarih: p.tarih,
      tutar: p.tutar,
      etiket: p.tur === "avans" ? "Personel avansı" : "Personel ödemesi",
      taraf: p.personel?.ad_soyad ?? "Personel",
    })),
    ...nakitBankaHareketleri
      .filter((n) => n.kaynak_kasa)
      .map((n) => ({
        id: n.id,
        tarih: n.tarih,
        tutar: n.tutar,
        etiket: n.tip === "hesaplar_arasi" ? "Bankaya transfer" : "Kasadan çıkan",
        taraf: n.karsi_taraf_adi ?? undefined,
        aciklama: n.aciklama ?? undefined,
        sil: { hedef: "nakit_banka_hareketi" as const, id: n.id },
      })),
    ...kamusalOdemeleri.map((k) => ({
      id: k.id,
      tarih: k.odeme_tarihi,
      tutar: k.tutar,
      etiket: "Kamusal ödeme",
      taraf: ODEME_TIPI_ETIKET[k.odeme_tipi as OdemeTipi] ?? k.odeme_tipi,
      aciklama: k.notlar ?? undefined,
    })),
    ...dengelemeler
      .filter((d) => d.tutar < 0)
      .map((d) => dengelemeSatiri(d, -d.tutar)),
  ];

  const kasaKontrol: KasaKontrolBilgisi = {
    baslangicTutari,
    baslangicZamani,
    baslangicGiren: kasaAyari.baslangic_giren ?? null,
    girenKisi: kullanici.ad_soyad ?? "—",
  };

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Kasa"
          description="Nakit tahsilat ve ödemelerin günlük kasa hareketleri."
          icon={Banknote}
        />

        <KasaClient
          kasaKontrol={kasaKontrol}
          donemBaslangicBakiyesi={donemBaslangicBakiyesi}
          mod={donem.mod}
          yil={donem.yil}
          ay={donem.ay}
          gelenRows={gelenRows}
          gidenRows={gidenRows}
          bankaHesaplari={v.bankaHesaplari}
          personelListesi={v.personelListesi}
          araclar={v.araclar}
          kartlar={v.kartlar}
          duzenlenebilir={duzenlenebilir}
        />
      </div>
    </div>
  );
}

function dengelemeSatiri(d: DengelemeSatiri, tutar: number): LedgerSatiri {
  return {
    id: d.id,
    tarih: formatDateForInput(d.created_at),
    tutar,
    etiket: "Kasa Dengeleme",
    taraf: d.ekleyen_ad,
    aciklama: d.aciklama ?? undefined,
    sil: { hedef: "kasa_dengeleme", id: d.id },
  };
}

import { Building2 } from "lucide-react";
import { withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import { finansDonemiCoz } from "@/lib/finans/donem";
import {
  aktifPersoneliGetir,
  araclariGetir,
  bankaDonemBasiBakiyeleri,
  bankaHesaplariniGetir,
  cariOdemeleriniGetir,
  harcamalariGetir,
  hastaOdemeleriniGetir,
  kamusalOdemeleriniGetir,
  kartOdemeleriniGetir,
  krediKartlariniGetir,
  nakitBankaHareketleriniGetir,
  personelOdemeleriniGetir,
} from "@/lib/finans/okuma";
import { BankaClient } from "./banka-client";

export default async function BankaSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string; yil?: string; ay?: string }>;
}) {
  const donem = finansDonemiCoz(await searchParams);

  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const { bag } = await panelBaglami();

  const duzenlenebilir = kullanici.rol === "klinik_admin";

  // Yalnız SEÇİLİ dönemin satırları; sıralama sabit (tarih + id). Dönem başı bakiye satır çekmeden SQL'den (banka_bakiye_once_toplam_tumu) gelir.
  const v = await withTenant(bag, async (tx) => ({
    bankaHesaplari: await bankaHesaplariniGetir(tx, true),
    // Banka'da yöntem 'banka_havalesi' VE 'kredi_karti' (kart tahsilatı tahsilat hesabına NET yazılır); iade satırları ÇIKIŞ sayılır.
    hastaOdemeleri: await hastaOdemeleriniGetir(tx, donem, ["banka_havalesi", "kredi_karti"]),
    harcamalar: await harcamalariGetir(tx, donem, "havale"),
    // Tedarikçi cari ödemesi (havale) ve karta yapılan havale ödemesi bankadan ÇIKIŞ olur.
    cariOdemeleri: await cariOdemeleriniGetir(tx, donem, "havale"),
    kartOdemeleri: await kartOdemeleriniGetir(tx, donem, "havale"),
    personelOdemeleri: await personelOdemeleriniGetir(tx, donem, "havale"),
    nakitBankaHareketleri: await nakitBankaHareketleriniGetir(tx, donem, "banka"),
    kamusalOdemeleri: await kamusalOdemeleriniGetir(tx, donem, "havale"),
    personelListesi: await aktifPersoneliGetir(tx),
    araclar: await araclariGetir(tx),
    kartlar: await krediKartlariniGetir(tx),
    oncekiBakiyeMap: await bankaDonemBasiBakiyeleri(tx, donem),
  }));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title="Banka" description="Banka hesapları bazında havale gelir/gider takibi." icon={Building2} />

        <BankaClient
          bankaHesaplari={v.bankaHesaplari}
          hastaOdemeleri={v.hastaOdemeleri}
          harcamalar={v.harcamalar}
          cariOdemeleri={v.cariOdemeleri}
          kartOdemeleri={v.kartOdemeleri}
          personelOdemeleri={v.personelOdemeleri}
          nakitBankaHareketleri={v.nakitBankaHareketleri}
          kamusalOdemeleri={v.kamusalOdemeleri}
          personelListesi={v.personelListesi}
          araclar={v.araclar}
          kartlar={v.kartlar}
          duzenlenebilir={duzenlenebilir}
          oncekiBakiyeMap={v.oncekiBakiyeMap}
          mod={donem.mod}
          yil={donem.yil}
          ay={donem.ay}
        />
      </div>
    </div>
  );
}

import { Wallet } from "lucide-react";
import { desc, asc } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tl } from "@/lib/para";
import { araclariGetir, bankaHesaplariniGetir, krediKartlariniGetir } from "@/lib/finans/okuma";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikHarcamaSatir } from "@/types/klinik-harcama";
import { YeniGiderButonu } from "./yeni-gider-butonu";
import { GiderListesi } from "./gider-listesi";
import { GiderlerSekmeCubugu } from "./giderler-sekme-cubugu";

export default async function GiderlerSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const { bag } = await panelBaglami();

  const duzenlenebilir = kullanici.rol === "klinik_admin";

  // Dönem filtresi (Aylık/Yıllık) GiderListesi içinde tamamen client-side yapılıyor — bu yüzden tüm kayıtlar tek seferde çekiliyor,
  // dönem değişince sunucuya round-trip yok.
  const v = await withTenant(bag, async (tx) => {
    const H = sema.klinikHarcama;
    const satirlar = await tx
      .select({
        id: H.id,
        tarih: H.tarih,
        tutar: H.tutar,
        kategori: H.kategori,
        aciklama: H.aciklama,
        tedarikci_adi: H.tedarikciAdi,
        arac_id: H.aracId,
        odeme_tipi: H.odemeTipi,
        banka_hesap_id: H.bankaHesapId,
        kredi_karti_id: H.krediKartiId,
        is_faturali: H.isFaturali,
        fatura_no: H.faturaNo,
      })
      .from(H)
      .orderBy(desc(H.tarih), asc(H.id));
    return {
      giderler: satirlar.map((g) => ({ ...g, tutar: tl(g.tutar) })) as KlinikHarcamaSatir[],
      araclar: await araclariGetir(tx),
      bankaHesaplari: await bankaHesaplariniGetir(tx),
      kartlar: await krediKartlariniGetir(tx),
    };
  });

  const { giderler, araclar, bankaHesaplari, kartlar } = v;
  // Tedarikçi önerileri: aynı tedarikçi farklı yazılıp cariyi bölmesin (anahtar: Türkçe küçük harf, tek boşluk).
  const tedarikciAdlari = [
    ...new Map(
      giderler
        .map((g) => (g.tedarikci_adi ?? "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .map((ad) => [ad.toLocaleLowerCase("tr-TR"), ad] as const)
    ).values(),
  ].sort((a, b) => a.localeCompare(b, "tr-TR"));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Giderler"
          description="Kira, sarf malzeme, fatura gibi genel işletme giderleri."
          icon={Wallet}
          actions={duzenlenebilir && <YeniGiderButonu
              araclar={araclar}
              bankaHesaplari={bankaHesaplari}
              kartlar={kartlar}
              tedarikciAdlari={tedarikciAdlari}
            />}
        />

        <GiderlerSekmeCubugu />

        <GiderListesi
          satirlar={giderler}
          duzenlenebilir={duzenlenebilir}
          araclar={araclar}
          bankaHesaplari={bankaHesaplari}
          kartlar={kartlar}
          tedarikciAdlari={tedarikciAdlari}
        />
      </div>
    </div>
  );
}

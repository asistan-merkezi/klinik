import { Truck } from "lucide-react";
import { and, asc, desc, isNotNull, ne } from "drizzle-orm";
import { rpc, sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tl, tlFark, tlTopla } from "@/lib/para";
import { bankaHesaplariniGetir, krediKartlariniGetir } from "@/lib/finans/okuma";
import { tedarikciAnahtari } from "@/lib/finans/tedarikci-anahtari";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikHarcamaSatir } from "@/types/klinik-harcama";
import { GiderlerSekmeCubugu } from "../giderler-sekme-cubugu";
import { TedarikciListesi, type TedarikciHareketi, type TedarikciOzeti } from "./tedarikci-listesi";

type HarcamaSatiri = Pick<
  KlinikHarcamaSatir,
  | "id"
  | "tarih"
  | "tutar"
  | "kategori"
  | "aciklama"
  | "tedarikci_adi"
  | "odeme_tipi"
  | "banka_hesap_id"
  | "kredi_karti_id"
  | "fatura_no"
>;

type CariOdemeSatiri = {
  id: string;
  tedarikci_adi: string;
  tutar: number;
  tarih: string;
  odeme_tipi: "nakit" | "havale" | "kredi_karti";
  banka_hesap_id: string | null;
  kredi_karti_id: string | null;
  aciklama: string | null;
};

type BakiyeSatiri = { anahtar: string; borc: number; odenen: number };

/**
 * Tedarikçi bazında CARİ DEFTERİ: `klinik_harcama.tedarikci_adi` + `klinik_cari_odeme`'den gruplanır
 * (ayrı tedarikçi tablosu yok). Borç/Ödenen toplamları SQL'de (`klinik_cari_bakiyeler`) hesaplanır, ekstre
 * satırları burada üretilir; ikisi aynı kuralı izler (bkz. migration 20261012100000):
 *  - "Cariye Ekle" gider → yalnız Borç; ödenmiş gider (nakit/havale/kart) → Borç ve Ödeme birlikte (net 0);
 *  - ödeme yöntemi boş gider → soluk satır, hiçbir toplama girmez; cari ödemesi → Ödeme.
 */
export default async function TedarikcilerSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const { bag } = await panelBaglami();
  const duzenlenebilir = kullanici.rol === "klinik_admin";

  const v = await withTenant(bag, async (tx) => {
    const H = sema.klinikHarcama;
    const O = sema.klinikCariOdeme;
    const harcamalar = await tx
      .select({
        id: H.id,
        tarih: H.tarih,
        tutar: H.tutar,
        kategori: H.kategori,
        aciklama: H.aciklama,
        tedarikci_adi: H.tedarikciAdi,
        odeme_tipi: H.odemeTipi,
        banka_hesap_id: H.bankaHesapId,
        kredi_karti_id: H.krediKartiId,
        fatura_no: H.faturaNo,
      })
      .from(H)
      .where(and(isNotNull(H.tedarikciAdi), ne(H.tedarikciAdi, "")))
      .orderBy(desc(H.tarih), asc(H.id));
    const cari = await tx
      .select({ id: O.id, tedarikci_adi: O.tedarikciAdi, tutar: O.tutar, tarih: O.tarih, odeme_tipi: O.odemeTipi, banka_hesap_id: O.bankaHesapId, kredi_karti_id: O.krediKartiId, aciklama: O.aciklama })
      .from(O)
      .orderBy(desc(O.tarih), asc(O.id));
    const bakiye = await rpc<{ anahtar: string; borc: string; odenen: string }>(tx, "klinik_cari_bakiyeler", { p_klinik_id: bag.tenantId });
    return {
      bankaHesaplari: await bankaHesaplariniGetir(tx),
      kartlar: await krediKartlariniGetir(tx),
      satirlar: harcamalar.map((r) => ({ ...r, tutar: tl(r.tutar) })) as HarcamaSatiri[],
      cariOdemeleri: cari.map((r) => ({ ...r, tutar: tl(r.tutar) })) as CariOdemeSatiri[],
      bakiyeSatirlari: bakiye.map((r) => ({ anahtar: r.anahtar, borc: tl(r.borc), odenen: tl(r.odenen) })) as BakiyeSatiri[],
    };
  });
  const { satirlar, cariOdemeleri, bakiyeSatirlari } = v;

  const bakiyeler = new Map(bakiyeSatirlari.map((b) => [b.anahtar, b]));
  const gruplar = new Map<string, TedarikciOzeti>();

  function grubuGetir(ad: string, tarih: string): TedarikciOzeti {
    const anahtar = tedarikciAnahtari(ad);
    let grup = gruplar.get(anahtar);
    if (!grup) {
      // Satırlar tarihe göre azalan geldiği için ilk görülen yazım en güncel olanıdır.
      const b = bakiyeler.get(anahtar);
      const borc = b?.borc ?? 0;
      const odenen = b?.odenen ?? 0;
      grup = {
        anahtar,
        ad: ad.trim(),
        toplamHarcama: 0,
        sonTarih: tarih,
        borc,
        odenen,
        bakiye: tlFark(borc, odenen),
        hareketler: [],
      };
      gruplar.set(anahtar, grup);
    }
    if (tarih > grup.sonTarih) grup.sonTarih = tarih;
    return grup;
  }

  for (const s of satirlar) {
    const ad = (s.tedarikci_adi ?? "").trim();
    if (!ad) continue;
    const grup = grubuGetir(ad, s.tarih);
    grup.toplamHarcama = tlTopla([grup.toplamHarcama, s.tutar]);
    grup.hareketler.push({
      tur: s.odeme_tipi === "cari" ? "cari_gider" : s.odeme_tipi ? "odenmis_gider" : "bekleyen_gider",
      id: s.id,
      tarih: s.tarih,
      tutar: s.tutar,
      kategori: s.kategori,
      aciklama: s.aciklama,
      odeme_tipi: s.odeme_tipi,
      banka_hesap_id: s.banka_hesap_id,
      kredi_karti_id: s.kredi_karti_id,
      fatura_no: s.fatura_no,
    });
  }

  for (const o of cariOdemeleri) {
    const grup = grubuGetir(o.tedarikci_adi, o.tarih);
    grup.hareketler.push({
      tur: "cari_odeme",
      id: o.id,
      tarih: o.tarih,
      tutar: o.tutar,
      kategori: null,
      aciklama: o.aciklama,
      odeme_tipi: o.odeme_tipi,
      banka_hesap_id: o.banka_hesap_id,
      kredi_karti_id: o.kredi_karti_id,
      fatura_no: null,
    });
  }

  // Ekstre kronolojik: aynı gün borç satırı ödemeden önce, sonra id ile kararlı sıra.
  const SIRA: Record<TedarikciHareketi["tur"], number> = {
    cari_gider: 0,
    odenmis_gider: 1,
    bekleyen_gider: 1,
    cari_odeme: 2,
  };
  for (const g of gruplar.values()) {
    g.hareketler.sort(
      (a, b) => a.tarih.localeCompare(b.tarih) || SIRA[a.tur] - SIRA[b.tur] || a.id.localeCompare(b.id)
    );
  }

  // Borçlular (en yüksek bakiye) önce, sonra toplam harcamaya göre.
  const tedarikciler = [...gruplar.values()].sort(
    (a, b) => tlFark(b.bakiye, a.bakiye) || tlFark(b.toplamHarcama, a.toplamHarcama)
  );

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Tedarikçiler ve Cari Takibi"
          description="Tedarikçi bazında borç, ödenen ve bakiye; cariye eklenen giderler ve cari ödemeleri."
          icon={Truck}
        />

        <GiderlerSekmeCubugu />

        <TedarikciListesi
          tedarikciler={tedarikciler}
          bankaHesaplari={v.bankaHesaplari}
          kartlar={v.kartlar}
          duzenlenebilir={duzenlenebilir}
        />
      </div>
    </div>
  );
}

import { Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-okuma";
import { tedarikciAnahtari } from "@/lib/finans/tedarikci-anahtari";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikBankaHesabi, KlinikKrediKarti } from "@/types/klinik";
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
  const supabase = await createClient();
  const duzenlenebilir = kullanici.rol === "klinik_admin";
  const klinikId = kullanici.klinik_id ?? "";

  const [bankaSonucu, kartSonucu, satirlar, cariOdemeleri, bakiyeSatirlari] = await Promise.all([
    supabase
      .from("klinik_banka_hesaplari")
      .select("id, banka_adi, sube")
      .order("sort_order")
      .returns<KlinikBankaHesabi[]>(),
    supabase
      .from("klinik_kredi_kartlari")
      .select("id, kart_tipi, kart_adi, banka_adi, kart_sahibi, son_dort_hane")
      .order("sort_order")
      .returns<KlinikKrediKarti[]>(),
    // Sayfalı: tek sorgu 1000 kayıtta sessizce kesilir.
    tumSayfalariOku<HarcamaSatiri>((bas, son) =>
      supabase
        .from("klinik_harcama")
        .select("id, tarih, tutar, kategori, aciklama, tedarikci_adi, odeme_tipi, banka_hesap_id, kredi_karti_id, fatura_no")
        .not("tedarikci_adi", "is", null)
        .neq("tedarikci_adi", "")
        .order("tarih", { ascending: false })
        .order("id")
        .range(bas, son)
        .returns<HarcamaSatiri[]>()
    ),
    tumSayfalariOku<CariOdemeSatiri>((bas, son) =>
      supabase
        .from("klinik_cari_odeme")
        .select("id, tedarikci_adi, tutar, tarih, odeme_tipi, banka_hesap_id, kredi_karti_id, aciklama")
        .order("tarih", { ascending: false })
        .order("id")
        .range(bas, son)
        .returns<CariOdemeSatiri[]>()
    ),
    // RPC de PostgREST 1000 satır sınırına tabidir → sayfalı.
    tumSayfalariOku<BakiyeSatiri>(async (bas, son) => {
      const sonuc = await supabase
        .rpc("klinik_cari_bakiyeler", { p_klinik_id: klinikId })
        .order("anahtar")
        .range(bas, son);
      return { data: sonuc.data as BakiyeSatiri[] | null, error: sonuc.error };
    }),
  ]);

  const bakiyeler = new Map(bakiyeSatirlari.map((b) => [b.anahtar, b]));
  const gruplar = new Map<string, TedarikciOzeti>();

  function grubuGetir(ad: string, tarih: string): TedarikciOzeti {
    const anahtar = tedarikciAnahtari(ad);
    let grup = gruplar.get(anahtar);
    if (!grup) {
      // Satırlar tarihe göre azalan geldiği için ilk görülen yazım en güncel olanıdır.
      const b = bakiyeler.get(anahtar);
      const borc = Number(b?.borc ?? 0);
      const odenen = Number(b?.odenen ?? 0);
      grup = {
        anahtar,
        ad: ad.trim(),
        toplamHarcama: 0,
        sonTarih: tarih,
        borc,
        odenen,
        bakiye: Math.round((borc - odenen) * 100) / 100,
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
    grup.toplamHarcama += s.tutar;
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
    (a, b) => b.bakiye - a.bakiye || b.toplamHarcama - a.toplamHarcama
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
          bankaHesaplari={bankaSonucu.data ?? []}
          kartlar={kartSonucu.data ?? []}
          duzenlenebilir={duzenlenebilir}
        />
      </div>
    </div>
  );
}

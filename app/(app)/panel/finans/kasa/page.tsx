import { Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { formatDateForInput } from "@/lib/datetime";
import { finansDonemiCoz, tumSayfalariOku } from "@/lib/finans/donem";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { KasaClient, type KasaKontrolBilgisi } from "./kasa-client";

// tur='iade' satırları (hasta nakit iadesi) aynı sorguyla gelir; Kasa'da ÇIKIŞ sayılır.
type HastaOdemeSatiri = { id: string; created_at: string; tutar: number; tur: string; hasta: { ad_soyad: string } | null };
type HarcamaSatiri = { id: string; tarih: string; tutar: number; tedarikci_adi: string | null; kategori: string };
type PersonelOdemeSatiri = {
  id: string;
  tarih: string;
  tutar: number;
  tur: string;
  personel: { ad_soyad: string } | null;
};
type NakitBankaSatiri = {
  id: string;
  tip: string;
  kaynak_kasa: boolean;
  hedef_kasa: boolean;
  tutar: number;
  tarih: string;
  aciklama: string | null;
  karsi_taraf_adi: string | null;
};
type DengelemeSatiri = { id: string; tutar: number; aciklama: string | null; ekleyen_ad: string; created_at: string };

type KasaAyari = { baslangic_tutari?: number; baslangic_zamani?: string; baslangic_giren?: string };

export default async function KasaSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string; yil?: string; ay?: string }>;
}) {
  const donem = finansDonemiCoz(await searchParams);

  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const supabase = await createClient();

  const duzenlenebilir = kullanici.rol === "klinik_admin";
  const klinikId = kullanici.klinik_id;

  // Yalnız SEÇİLİ dönemin satırları, 1000'lik sayfalarla (PostgREST max_rows sessiz kesmesin);
  // sıralama sabit (tarih + id). Dönem başı bakiye satır çekmeden RPC'den (Postgres SUM) gelir.
  const [
    ayarSonucu,
    hastaOdemeleri,
    harcamalar,
    personelOdemeleri,
    nakitBankaHareketleri,
    dengelemeler,
    bankaHesabiSonucu,
    personelListesiSonucu,
    aracSonucu,
    oncekiToplamSonucu,
  ] = await Promise.all([
    supabase.from("klinik_ayarlar").select("ayarlar").eq("klinik_id", klinikId ?? "").maybeSingle(),
    tumSayfalariOku((bas, son) =>
      supabase
        .from("hasta_bakiye_hareket")
        .select("id, created_at, tutar, tur, hasta:hasta_id(ad_soyad)")
        .in("tur", ["odeme", "iade"])
        .eq("odeme_yontemi", "nakit")
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
        .eq("odeme_tipi", "nakit")
        .gte("tarih", donem.baslangic)
        .lt("tarih", donem.bitis)
        .order("tarih")
        .order("id")
        .range(bas, son)
        .returns<HarcamaSatiri[]>()
    ),
    tumSayfalariOku((bas, son) =>
      supabase
        .from("personel_hesap_hareket")
        .select("id, tarih, tutar, tur, personel:personel_id(ad_soyad)")
        .eq("odeme_tipi", "nakit")
        .in("tur", ["odeme", "avans"])
        .gte("tarih", donem.baslangic)
        .lt("tarih", donem.bitis)
        .order("tarih")
        .order("id")
        .range(bas, son)
        .returns<PersonelOdemeSatiri[]>()
    ),
    tumSayfalariOku((bas, son) =>
      supabase
        .from("nakit_banka_hareketi")
        .select("id, tip, kaynak_kasa, hedef_kasa, tutar, tarih, aciklama, karsi_taraf_adi")
        .or("kaynak_kasa.eq.true,hedef_kasa.eq.true")
        .gte("tarih", donem.baslangic)
        .lt("tarih", donem.bitis)
        .order("tarih")
        .order("id")
        .range(bas, son)
        .returns<NakitBankaSatiri[]>()
    ),
    dengelemeleriOku(supabase, donem.baslangicTs, donem.bitisTs),
    supabase
      .from("klinik_banka_hesaplari")
      .select("id, banka_adi, sube")
      .order("sort_order")
      .returns<KlinikBankaHesabi[]>(),
    supabase
      .from("personel")
      .select("id, ad_soyad")
      .eq("aktif", true)
      .order("ad_soyad")
      .returns<{ id: string; ad_soyad: string }[]>(),
    supabase.from("klinik_arac").select("id, marka, model, plaka").order("plaka").returns<KlinikArac[]>(),
    supabase.rpc("kasa_bakiye_once_toplam", { p_once_tarih: donem.baslangic }),
  ]);
  if (oncekiToplamSonucu.error) throw new Error(oncekiToplamSonucu.error.message);

  const kasaAyari = (ayarSonucu.data?.ayarlar as { kasa?: KasaAyari } | null)?.kasa ?? {};
  const baslangicTutari = kasaAyari.baslangic_tutari ?? 0;
  const baslangicZamani = kasaAyari.baslangic_zamani ?? null;
  const baslangicGunu = baslangicZamani ? formatDateForInput(baslangicZamani) : null;

  // Başlangıç tutarı: giriş zamanı YOKSA (eski kayıt) her dönemin açılışıdır. Zamanı varsa
  // girildiği günden itibaren sayılır — o günden önceki dönemlerde 0, o dönemde "Kasa Başlangıç"
  // hareketi, sonraki dönemlerde açılış bakiyesine dahil.
  let donemBaslangicBakiyesi = Number(oncekiToplamSonucu.data ?? 0);
  let baslangicHareketi: LedgerSatiri | null = null;
  if (baslangicTutari > 0) {
    if (!baslangicGunu || baslangicGunu < donem.baslangic) {
      donemBaslangicBakiyesi += baslangicTutari;
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
          bankaHesaplari={bankaHesabiSonucu.data ?? []}
          personelListesi={personelListesiSonucu.data ?? []}
          araclar={aracSonucu.data ?? []}
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

/**
 * kasa_dengeleme tablosu 20261005090000 migration'ıyla gelir. Migration henüz uygulanmadan bu kod
 * deploy edilirse tablo yok hatası TÜM Kasa sayfasını düşürmesin — o zaman yalnız dengeleme
 * satırları boş sayılır (başka her hata yine fırlatır).
 */
async function dengelemeleriOku(
  supabase: Awaited<ReturnType<typeof createClient>>,
  baslangicTs: string,
  bitisTs: string
): Promise<DengelemeSatiri[]> {
  try {
    return await tumSayfalariOku((bas, son) =>
      supabase
        .from("kasa_dengeleme")
        .select("id, tutar, aciklama, ekleyen_ad, created_at")
        .gte("created_at", baslangicTs)
        .lt("created_at", bitisTs)
        .order("created_at")
        .order("id")
        .range(bas, son)
        .returns<DengelemeSatiri[]>()
    );
  } catch (hata) {
    const mesaj = hata instanceof Error ? hata.message : "";
    if (mesaj.includes("kasa_dengeleme")) {
      console.error("kasa_dengeleme tablosu okunamadı (migration uygulanmamış olabilir):", mesaj);
      return [];
    }
    throw hata;
  }
}

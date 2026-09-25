import { redirect } from "next/navigation";
import { Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";
import { KasaClient } from "./kasa-client";

type HastaOdemeSatiri = { id: string; created_at: string; tutar: number; hasta: { ad_soyad: string } | null };
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

export default async function KasaSayfasi({ searchParams }: { searchParams: Promise<{ yil?: string }> }) {
  const { yil: yilParam } = await searchParams;
  const simdikiYil = new Date().getFullYear();
  const secilenYil = yilParam && /^\d{4}$/.test(yilParam) ? Number(yilParam) : simdikiYil;
  const yilBaslangicTarih = `${secilenYil}-01-01`;
  const yilBitisTarih = `${secilenYil + 1}-01-01`;
  const yilBaslangicTs = `${yilBaslangicTarih}T00:00:00.000Z`;
  const yilBitisTs = `${yilBitisTarih}T00:00:00.000Z`;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol, klinik_id")
    .eq("id", user.id)
    .single();

  const yetkili =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "muhasebe" || kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const duzenlenebilir = kullanici?.rol === "klinik_admin";
  const klinikId = kullanici?.klinik_id;

  const [
    ayarSonucu,
    hastaOdemeSonucu,
    harcamaSonucu,
    personelOdemeSonucu,
    nakitBankaSonucu,
    bankaHesabiSonucu,
    personelListesiSonucu,
    aracSonucu,
    oncekiToplamSonucu,
  ] = await Promise.all([
      supabase.from("klinik_ayarlar").select("ayarlar").eq("klinik_id", klinikId ?? "").maybeSingle(),
      supabase
        .from("hasta_bakiye_hareket")
        .select("id, created_at, tutar, hasta:hasta_id(ad_soyad)")
        .eq("tur", "odeme")
        .eq("odeme_yontemi", "nakit")
        .gte("created_at", yilBaslangicTs)
        .lt("created_at", yilBitisTs)
        .returns<HastaOdemeSatiri[]>(),
      supabase
        .from("klinik_harcama")
        .select("id, tarih, tutar, tedarikci_adi, kategori")
        .eq("odeme_tipi", "nakit")
        .gte("tarih", yilBaslangicTarih)
        .lt("tarih", yilBitisTarih)
        .returns<HarcamaSatiri[]>(),
      supabase
        .from("personel_hesap_hareket")
        .select("id, tarih, tutar, tur, personel:personel_id(ad_soyad)")
        .eq("odeme_tipi", "nakit")
        .in("tur", ["odeme", "avans"])
        .gte("tarih", yilBaslangicTarih)
        .lt("tarih", yilBitisTarih)
        .returns<PersonelOdemeSatiri[]>(),
      supabase
        .from("nakit_banka_hareketi")
        .select("id, tip, kaynak_kasa, hedef_kasa, tutar, tarih, aciklama, karsi_taraf_adi")
        .or("kaynak_kasa.eq.true,hedef_kasa.eq.true")
        .gte("tarih", yilBaslangicTarih)
        .lt("tarih", yilBitisTarih)
        .returns<NakitBankaSatiri[]>(),
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
      supabase.rpc("kasa_bakiye_once_toplam", { p_once_tarih: yilBaslangicTarih }),
    ]);

  // "Kasa Başlangıç Tutarı" kartında gösterilip düzenlenen ayar — LedgerView'a
  // verilen dönem başı bakiyeden AYRI tutuluyor (biri sabit ayar, diğeri seçili
  // yıla göre değişen hesaplanmış bir değer).
  const baslangicTutari =
    (ayarSonucu.data?.ayarlar as { kasa?: { baslangic_tutari?: number } } | null)?.kasa?.baslangic_tutari ?? 0;
  // Seçili yıldan önceki tüm hareketlerin net toplamı artık tek bir RPC'den
  // (Postgres SUM) geliyor — tüm ömür boyu geçmişi indirip JS'te toplamak
  // yerine (bkz. 20260925090000_kasa_banka_bakiye_once_toplam_rpc.sql).
  const donemBaslangicBakiyesi = baslangicTutari + (oncekiToplamSonucu.data ?? 0);

  const gelenRows: LedgerSatiri[] = [
    ...(hastaOdemeSonucu.data ?? []).map((h) => ({
      tarih: h.created_at.slice(0, 10),
      tutar: h.tutar,
      etiket: "Hasta ödemesi",
      taraf: h.hasta?.ad_soyad ?? "Hasta",
    })),
    ...(nakitBankaSonucu.data ?? [])
      .filter((n) => n.hedef_kasa)
      .map((n) => ({
        tarih: n.tarih,
        tutar: n.tutar,
        etiket: n.tip === "hesaplar_arasi" ? "Bankadan transfer" : "Kasaya giren",
        taraf: n.karsi_taraf_adi ?? n.aciklama ?? undefined,
      })),
  ];

  const gidenRows: LedgerSatiri[] = [
    ...(harcamaSonucu.data ?? []).map((g) => ({
      tarih: g.tarih,
      tutar: g.tutar,
      etiket: g.tedarikci_adi ?? g.kategori,
      taraf: g.tedarikci_adi ?? undefined,
    })),
    ...(personelOdemeSonucu.data ?? []).map((p) => ({
      tarih: p.tarih,
      tutar: p.tutar,
      etiket: p.tur === "avans" ? "Personel avansı" : "Personel ödemesi",
      taraf: p.personel?.ad_soyad ?? "Personel",
    })),
    ...(nakitBankaSonucu.data ?? [])
      .filter((n) => n.kaynak_kasa)
      .map((n) => ({
        tarih: n.tarih,
        tutar: n.tutar,
        etiket: n.tip === "hesaplar_arasi" ? "Bankaya transfer" : "Kasadan çıkan",
        taraf: n.karsi_taraf_adi ?? n.aciklama ?? undefined,
      })),
  ];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Kasa"
          description="Nakit kasa başlangıç tutarı ve gün sonu kapanış takibi."
          icon={Banknote}
        />

        <KasaClient
          baslangicTutari={baslangicTutari}
          donemBaslangicBakiyesi={donemBaslangicBakiyesi}
          yil={secilenYil}
          gelenRows={gelenRows}
          gidenRows={gidenRows}
          bankaHesaplari={bankaHesabiSonucu.data ?? []}
          nakitBankaHareketleri={nakitBankaSonucu.data ?? []}
          personelListesi={personelListesiSonucu.data ?? []}
          araclar={aracSonucu.data ?? []}
          duzenlenebilir={duzenlenebilir}
        />
      </div>
    </div>
  );
}

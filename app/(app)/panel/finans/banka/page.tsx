import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import { BankaClient } from "./banka-client";

type HastaOdemeSatiri = {
  id: string;
  created_at: string;
  tutar: number;
  banka_hesap_id: string | null;
  hasta: { ad_soyad: string } | null;
};
type HarcamaSatiri = {
  id: string;
  tarih: string;
  tutar: number;
  tedarikci_adi: string | null;
  kategori: string;
  banka_hesap_id: string | null;
};
type PersonelOdemeSatiri = {
  id: string;
  tarih: string;
  tutar: number;
  tur: string;
  banka_hesap_id: string | null;
  personel: { ad_soyad: string } | null;
};
type NakitBankaSatiri = {
  id: string;
  tip: string;
  kaynak_kasa: boolean;
  kaynak_banka_hesap_id: string | null;
  hedef_kasa: boolean;
  hedef_banka_hesap_id: string | null;
  odeme_yontemi: string | null;
  tutar: number;
  tarih: string;
  aciklama: string | null;
  karsi_taraf_adi: string | null;
  karsi_taraf_banka: string | null;
  karsi_taraf_iban: string | null;
};

export default async function BankaSayfasi({ searchParams }: { searchParams: Promise<{ yil?: string }> }) {
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

  const [
    bankaHesabiSonucu,
    hastaOdemeSonucu,
    harcamaSonucu,
    personelOdemeSonucu,
    nakitBankaSonucu,
    personelListesiSonucu,
    aracSonucu,
    oncekiToplamSonucu,
  ] = await Promise.all([
    supabase.from("klinik_banka_hesaplari").select("id, banka_adi, sube").order("sort_order").returns<KlinikBankaHesabi[]>(),
    supabase
      .from("hasta_bakiye_hareket")
      .select("id, created_at, tutar, banka_hesap_id, hasta:hasta_id(ad_soyad)")
      .eq("tur", "odeme")
      .eq("odeme_yontemi", "banka_havalesi")
      .gte("created_at", yilBaslangicTs)
      .lt("created_at", yilBitisTs)
      .returns<HastaOdemeSatiri[]>(),
    supabase
      .from("klinik_harcama")
      .select("id, tarih, tutar, tedarikci_adi, kategori, banka_hesap_id")
      .eq("odeme_tipi", "havale")
      .gte("tarih", yilBaslangicTarih)
      .lt("tarih", yilBitisTarih)
      .returns<HarcamaSatiri[]>(),
    supabase
      .from("personel_hesap_hareket")
      .select("id, tarih, tutar, tur, banka_hesap_id, personel:personel_id(ad_soyad)")
      .eq("odeme_tipi", "havale")
      .in("tur", ["odeme", "avans"])
      .gte("tarih", yilBaslangicTarih)
      .lt("tarih", yilBitisTarih)
      .returns<PersonelOdemeSatiri[]>(),
    supabase
      .from("nakit_banka_hareketi")
      .select(
        "id, tip, kaynak_kasa, kaynak_banka_hesap_id, hedef_kasa, hedef_banka_hesap_id, odeme_yontemi, tutar, tarih, aciklama, karsi_taraf_adi, karsi_taraf_banka, karsi_taraf_iban"
      )
      .or("kaynak_banka_hesap_id.not.is.null,hedef_banka_hesap_id.not.is.null")
      .gte("tarih", yilBaslangicTarih)
      .lt("tarih", yilBitisTarih)
      .returns<NakitBankaSatiri[]>(),
    supabase.from("personel").select("id, ad_soyad").eq("aktif", true).order("ad_soyad").returns<{ id: string; ad_soyad: string }[]>(),
    supabase.from("klinik_arac").select("id, marka, model, plaka").order("plaka").returns<KlinikArac[]>(),
    supabase.rpc("banka_bakiye_once_toplam_tumu", { p_once_tarih: yilBaslangicTarih }),
  ]);

  // Her banka hesabının seçili yıldan ÖNCEKİ net toplamı — tüm ömür boyu
  // geçmişi indirip JS'te toplamak yerine tek bir RPC'den (Postgres SUM)
  // geliyor (bkz. 20260925090000_kasa_banka_bakiye_once_toplam_rpc.sql).
  const oncekiBakiyeMap: Record<string, number> = {};
  for (const satir of oncekiToplamSonucu.data ?? []) {
    oncekiBakiyeMap[satir.banka_hesap_id] = satir.toplam;
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title="Banka" description="Banka hesapları bazında havale gelir/gider takibi." icon={Building2} />

        <BankaClient
          bankaHesaplari={bankaHesabiSonucu.data ?? []}
          hastaOdemeleri={hastaOdemeSonucu.data ?? []}
          harcamalar={harcamaSonucu.data ?? []}
          personelOdemeleri={personelOdemeSonucu.data ?? []}
          nakitBankaHareketleri={nakitBankaSonucu.data ?? []}
          personelListesi={personelListesiSonucu.data ?? []}
          araclar={aracSonucu.data ?? []}
          duzenlenebilir={duzenlenebilir}
          oncekiBakiyeMap={oncekiBakiyeMap}
          yil={secilenYil}
        />
      </div>
    </div>
  );
}

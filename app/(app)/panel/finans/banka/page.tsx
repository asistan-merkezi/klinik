import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { PageHeader } from "@/components/ui/page-header";
import { finansDonemiCoz, tumSayfalariOku } from "@/lib/finans/donem";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import { BankaClient } from "./banka-client";

type HastaOdemeSatiri = {
  id: string;
  created_at: string;
  tutar: number;
  banka_hesap_id: string | null;
  // tur='iade' satırları (hasta havale iadesi) aynı sorguyla gelir; Banka'da ÇIKIŞ sayılır.
  tur: string;
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

export default async function BankaSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string; yil?: string; ay?: string }>;
}) {
  const donem = finansDonemiCoz(await searchParams);

  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const supabase = await createClient();

  const duzenlenebilir = kullanici.rol === "klinik_admin";

  // Yalnız SEÇİLİ dönemin satırları, 1000'lik sayfalarla (PostgREST max_rows sessiz kesmesin);
  // sıralama sabit (tarih + id). Dönem başı bakiye satır çekmeden RPC'den (Postgres SUM) gelir.
  const [
    bankaHesabiSonucu,
    hastaOdemeleri,
    harcamalar,
    personelOdemeleri,
    nakitBankaHareketleri,
    personelListesiSonucu,
    aracSonucu,
    oncekiToplamSonucu,
  ] = await Promise.all([
    supabase.from("klinik_banka_hesaplari").select("id, banka_adi, sube").order("sort_order").returns<KlinikBankaHesabi[]>(),
    tumSayfalariOku((bas, son) =>
      supabase
        .from("hasta_bakiye_hareket")
        .select("id, created_at, tutar, banka_hesap_id, tur, hasta:hasta_id(ad_soyad)")
        .in("tur", ["odeme", "iade"])
        .eq("odeme_yontemi", "banka_havalesi")
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
        .select("id, tarih, tutar, tedarikci_adi, kategori, banka_hesap_id")
        .eq("odeme_tipi", "havale")
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
        .select("id, tarih, tutar, tur, banka_hesap_id, personel:personel_id(ad_soyad)")
        .eq("odeme_tipi", "havale")
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
        .select(
          "id, tip, kaynak_kasa, kaynak_banka_hesap_id, hedef_kasa, hedef_banka_hesap_id, odeme_yontemi, tutar, tarih, aciklama, karsi_taraf_adi, karsi_taraf_banka, karsi_taraf_iban"
        )
        .or("kaynak_banka_hesap_id.not.is.null,hedef_banka_hesap_id.not.is.null")
        .gte("tarih", donem.baslangic)
        .lt("tarih", donem.bitis)
        .order("tarih")
        .order("id")
        .range(bas, son)
        .returns<NakitBankaSatiri[]>()
    ),
    supabase.from("personel").select("id, ad_soyad").eq("aktif", true).order("ad_soyad").returns<{ id: string; ad_soyad: string }[]>(),
    supabase.from("klinik_arac").select("id, marka, model, plaka").order("plaka").returns<KlinikArac[]>(),
    supabase.rpc("banka_bakiye_once_toplam_tumu", { p_once_tarih: donem.baslangic }),
  ]);
  if (oncekiToplamSonucu.error) throw new Error(oncekiToplamSonucu.error.message);

  // Her banka hesabının DÖNEMDEN önceki net toplamı (hesap bazlı "dönem başı bakiye").
  const oncekiBakiyeMap: Record<string, number> = {};
  for (const satir of oncekiToplamSonucu.data ?? []) {
    oncekiBakiyeMap[satir.banka_hesap_id] = Number(satir.toplam);
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title="Banka" description="Banka hesapları bazında havale gelir/gider takibi." icon={Building2} />

        <BankaClient
          bankaHesaplari={bankaHesabiSonucu.data ?? []}
          hastaOdemeleri={hastaOdemeleri}
          harcamalar={harcamalar}
          personelOdemeleri={personelOdemeleri}
          nakitBankaHareketleri={nakitBankaHareketleri}
          personelListesi={personelListesiSonucu.data ?? []}
          araclar={aracSonucu.data ?? []}
          duzenlenebilir={duzenlenebilir}
          oncekiBakiyeMap={oncekiBakiyeMap}
          mod={donem.mod}
          yil={donem.yil}
          ay={donem.ay}
        />
      </div>
    </div>
  );
}

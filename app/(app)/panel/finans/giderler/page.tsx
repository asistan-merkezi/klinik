import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import type { KlinikArac, KlinikBankaHesabi } from "@/types/klinik";
import type { KlinikHarcamaSatir } from "@/types/klinik-harcama";
import { YeniGiderButonu } from "./yeni-gider-butonu";
import { GiderListesi } from "./gider-listesi";

export default async function GiderlerSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  const yetkili =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "muhasebe" || kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const duzenlenebilir = kullanici?.rol === "klinik_admin";

  // Dönem filtresi (Aylık/Yıllık) GiderListesi içinde tamamen client-side
  // yapılıyor — bu yüzden tüm kayıtlar tek seferde çekiliyor, dönem
  // değişince sunucuya round-trip yok.
  const [harcamaSonucu, aracSonucu, bankaSonucu] = await Promise.all([
    supabase
      .from("klinik_harcama")
      .select(
        "id, tarih, tutar, kategori, aciklama, tedarikci_adi, arac_id, odeme_tipi, banka_hesap_id, is_faturali, fatura_no"
      )
      .order("tarih", { ascending: false })
      .returns<KlinikHarcamaSatir[]>(),
    supabase.from("klinik_arac").select("id, marka, model, plaka").order("plaka").returns<KlinikArac[]>(),
    supabase
      .from("klinik_banka_hesaplari")
      .select("id, banka_adi, sube")
      .order("sort_order")
      .returns<KlinikBankaHesabi[]>(),
  ]);

  const giderler = harcamaSonucu.data ?? [];
  const araclar = aracSonucu.data ?? [];
  const bankaHesaplari = bankaSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Giderler"
          description="Kira, sarf malzeme, fatura gibi genel işletme giderleri."
          icon={Wallet}
          actions={duzenlenebilir && <YeniGiderButonu araclar={araclar} bankaHesaplari={bankaHesaplari} />}
        />

        <GiderListesi
          satirlar={giderler}
          duzenlenebilir={duzenlenebilir}
          araclar={araclar}
          bankaHesaplari={bankaHesaplari}
        />
      </div>
    </div>
  );
}

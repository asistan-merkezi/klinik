import { createClient } from "@/lib/supabase/server";
import { tumSayfalariOku } from "@/lib/supabase/sayfali-okuma";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { HandCoins } from "lucide-react";
import { CariAlacaklarListesi } from "./cari-alacaklar-listesi";

type CariOzetSatiri = {
  hasta_id: string;
  ad_soyad: string;
  toplam_bakiye: number;
  tahsil_edilen: number;
  kalan_bakiye: number;
};

export default async function CariAlacaklarTakibiSayfasi() {
  await sayfaYetkisiIste(ROL_GRUPLARI.finansFatura);
  const supabase = await createClient();

  const satirlar = await tumSayfalariOku<CariOzetSatiri>((bas, son) =>
    supabase
      .from("v_hasta_cari_ozet")
      .select("hasta_id, ad_soyad, toplam_bakiye, tahsil_edilen, kalan_bakiye")
      .order("kalan_bakiye", { ascending: false })
      .order("toplam_bakiye", { ascending: false })
      .order("hasta_id")
      .range(bas, son)
      .returns<CariOzetSatiri[]>()
  );

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Cari Alacaklar Takibi"
          description="Seans bedeli veya paket satışı cariye işlenen hastaların toplam bakiye, tahsil edilen ve kalan bakiye durumu. Bir satıra tıklayınca hastanın Cari & Ödeme sayfası açılır."
          icon={HandCoins}
        />

        {satirlar.length === 0 ? (
          <EmptyState icon={HandCoins} title="Henüz cari borç kaydı yok." />
        ) : (
          <CariAlacaklarListesi satirlar={satirlar} />
        )}
      </div>
    </div>
  );
}

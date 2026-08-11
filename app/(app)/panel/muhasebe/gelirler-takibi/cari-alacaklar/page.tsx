import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  const yetkili =
    kullanici?.rol === "klinik_admin" ||
    kullanici?.rol === "resepsiyon" ||
    kullanici?.rol === "muhasebe" ||
    kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const { data } = await supabase
    .from("v_hasta_cari_ozet")
    .select("hasta_id, ad_soyad, toplam_bakiye, tahsil_edilen, kalan_bakiye")
    .order("kalan_bakiye", { ascending: false })
    .order("toplam_bakiye", { ascending: false })
    .returns<CariOzetSatiri[]>();

  const satirlar = data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Cari Alacaklar Takibi</h1>
          <p className="text-sm text-muted-foreground">
            Paketsiz check-in ile borçlandırılan hastaların toplam bakiye, tahsil edilen ve kalan bakiye
            durumu. Bir satıra tıklayınca hastanın Cari & Ödeme sayfası açılır.
          </p>
        </header>

        {satirlar.length === 0 ? (
          <EmptyState icon={HandCoins} title="Henüz cari borç kaydı yok." />
        ) : (
          <CariAlacaklarListesi satirlar={satirlar} />
        )}
      </div>
    </div>
  );
}

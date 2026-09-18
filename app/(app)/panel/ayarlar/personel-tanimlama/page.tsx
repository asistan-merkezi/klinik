import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { Pozisyon } from "@/types/pozisyon";
import { PozisyonlarListesi } from "./pozisyonlar-listesi";
import { OzelPozisyonDialog } from "./ozel-pozisyon-dialog";

export default async function PersonelTanimlamaSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();
  const duzenlenebilir = kullanici?.rol === "klinik_admin";

  const { data: pozisyonSonucu } = await supabase
    .from("pozisyonlar")
    .select("id, ad, grup, sira, aktif, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi")
    .returns<Pozisyon[]>();

  const pozisyonlar = pozisyonSonucu ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={Briefcase}
          title="Personel Tanımlama"
          description="İşletmenizde çalışılan departman/unvanları seçin. Aktif olanlar Personel ve Yetkilendirme'de kullanılabilir olur; sistem erişimi olup olmayacağını da buradan belirleyin."
          actions={duzenlenebilir && <OzelPozisyonDialog />}
        />

        {pozisyonlar.length === 0 ? (
          <EmptyState icon={Briefcase} title="Henüz pozisyon tanımlı değil." />
        ) : (
          <PozisyonlarListesi pozisyonlar={pozisyonlar} duzenlenebilir={duzenlenebilir} />
        )}
      </div>
    </div>
  );
}

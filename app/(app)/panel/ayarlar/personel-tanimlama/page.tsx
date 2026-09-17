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

  const [{ data: pozisyonSonucu }, { data: personelSayimSonucu }] = await Promise.all([
    supabase
      .from("pozisyonlar")
      .select("id, ad, grup, sira, aktif, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi")
      .returns<Pozisyon[]>(),
    supabase.from("personel").select("pozisyon_id").eq("aktif", true).not("pozisyon_id", "is", null),
  ]);

  const personelSayilari = new Map<string, number>();
  for (const p of personelSayimSonucu ?? []) {
    if (!p.pozisyon_id) continue;
    personelSayilari.set(p.pozisyon_id, (personelSayilari.get(p.pozisyon_id) ?? 0) + 1);
  }

  const pozisyonlar = pozisyonSonucu ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={Briefcase}
          title="Personel Tanımlama"
          description="Personele atanacak pozisyonların sistem erişimi, rol, ücret tipi ve puantaj ayarlarını yönet."
          actions={duzenlenebilir && <OzelPozisyonDialog />}
        />

        {pozisyonlar.length === 0 ? (
          <EmptyState icon={Briefcase} title="Henüz pozisyon tanımlı değil." />
        ) : (
          <PozisyonlarListesi
            pozisyonlar={pozisyonlar}
            personelSayilari={personelSayilari}
            duzenlenebilir={duzenlenebilir}
          />
        )}
      </div>
    </div>
  );
}

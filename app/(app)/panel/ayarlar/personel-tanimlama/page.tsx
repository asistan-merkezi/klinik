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

  const [{ data: pozisyonSonucu }, { data: personelSonucu }] = await Promise.all([
    supabase
      .from("pozisyonlar")
      .select("id, ad, grup, sira, aktif, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi")
      .returns<Pozisyon[]>(),
    supabase.from("personel").select("pozisyon_id").eq("aktif", true),
  ]);

  const pozisyonlar = pozisyonSonucu ?? [];

  // Özel Pozisyon Ekle'deki Departman seçimi — mevcut pozisyonlardaki grup
  // adlarından türetilir (sabit bir liste değil, katalog değişirse otomatik
  // güncellenir), listedeki sıralamayla aynı (en küçük sıraya göre).
  const departmanSiralari = new Map<string, number>();
  for (const poz of pozisyonlar) {
    const mevcut = departmanSiralari.get(poz.grup);
    if (mevcut === undefined || poz.sira < mevcut) departmanSiralari.set(poz.grup, poz.sira);
  }
  const departmanlar = [...departmanSiralari.entries()].sort((a, b) => a[1] - b[1]).map(([grup]) => grup);

  // "Deneme İçin Oluştur" kısayolu sadece aktif ama hiç aktif çalışanı olmayan
  // pozisyonlarda gösterilir (bkz. pozisyon-satiri.tsx).
  const calisaniOlanPozisyonIdleri = [
    ...new Set((personelSonucu ?? []).map((p) => p.pozisyon_id).filter((id): id is string => id !== null)),
  ];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={Briefcase}
          title="Personel Tanımlama"
          description="İşletmenizde çalışılan departman/unvanları seçin. Aktif olanlar Personel ve Yetkilendirme'de kullanılabilir olur; sistem erişimi olup olmayacağını da buradan belirleyin."
          actions={duzenlenebilir && <OzelPozisyonDialog departmanlar={departmanlar} />}
        />

        {pozisyonlar.length === 0 ? (
          <EmptyState icon={Briefcase} title="Henüz pozisyon tanımlı değil." />
        ) : (
          <PozisyonlarListesi
            pozisyonlar={pozisyonlar}
            duzenlenebilir={duzenlenebilir}
            calisaniOlanPozisyonIdleri={calisaniOlanPozisyonIdleri}
          />
        )}
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { PersonelSatir } from "@/types/personel";
import { PersonelListesi } from "../personel-listesi";

export default async function PersonelListesiSayfasi() {
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

  const yonetici = kullanici?.rol === "klinik_admin";

  const [{ data: personelSonucu, error }, { data: bilgiDurumu }] = await Promise.all([
    supabase
      .from("personel")
      .select("id, ad_soyad, gorev, maas, aktif, kullanici:kullanici_id(telefon)")
      .order("ad_soyad")
      .returns<PersonelSatir[]>(),
    supabase.from("v_personel_bilgi_durumu").select("personel_id, bilgiler_tamam"),
  ]);

  const tamamlikMap = new Map((bilgiDurumu ?? []).map((d) => [d.personel_id, d.bilgiler_tamam]));
  const personelListesi = (personelSonucu ?? []).map((p) => ({
    ...p,
    bilgiler_tamam: tamamlikMap.get(p.id) ?? false,
  }));

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24 sm:max-w-3xl sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Personel Listesi</h1>
            <p className="text-sm text-muted-foreground">
              Çalışanlar; terapistler için performans ve maaş hesaplama.
            </p>
          </div>
          {yonetici && (
            <Button
              nativeButton={false}
              className="bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-600"
              render={
                <Link href="/panel/personel/basvurular">
                  <Briefcase /> İş Başvurusu Ekle
                </Link>
              }
            />
          )}
        </header>

        {error && <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>}
        {!error && personelListesi.length === 0 && (
          <EmptyState icon={Users} title="Henüz personel kaydı yok." />
        )}
        {!error && personelListesi.length > 0 && (
          <PersonelListesi personelListesi={personelListesi} yonetici={yonetici} />
        )}
      </div>
    </div>
  );
}

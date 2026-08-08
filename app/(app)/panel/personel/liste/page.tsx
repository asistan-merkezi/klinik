import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonelSatir } from "@/types/personel";
import { YeniPersonelDialog } from "../yeni-personel-dialog";
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

  const { data: personelSonucu, error } = await supabase
    .from("personel")
    .select("id, ad_soyad, gorev, maas, aktif, kullanici:kullanici_id(telefon)")
    .order("ad_soyad")
    .returns<PersonelSatir[]>();

  const personelListesi = personelSonucu ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Personel Listesi</h1>
            <p className="text-sm text-muted-foreground">
              Çalışanlar; terapistler için performans ve maaş hesaplama.
            </p>
          </div>
          {yonetici && (
            <div className="shrink-0">
              <YeniPersonelDialog />
            </div>
          )}
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Çalışanlar</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>}
            {!error && personelListesi.length === 0 && (
              <p className="text-sm text-muted-foreground">Henüz personel kaydı yok.</p>
            )}
            {!error && personelListesi.length > 0 && (
              <PersonelListesi personelListesi={personelListesi} yonetici={yonetici} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

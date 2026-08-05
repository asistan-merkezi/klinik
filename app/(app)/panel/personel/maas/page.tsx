import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonelMaasYilTablosu, type MaasYilPersonel } from "./maas-yil-tablosu";

export default async function PersonelMaasSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ yil?: string }>;
}) {
  const { yil: yilParam } = await searchParams;
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

  if (kullanici?.rol !== "klinik_admin") {
    notFound();
  }

  const guncelYil = new Date().getFullYear();
  const yil = Number(yilParam) || guncelYil;
  const yilSecenekleri = Array.from({ length: 6 }, (_, i) => guncelYil - i);

  const { data: personelSonucu } = await supabase
    .from("personel")
    .select("gorev, maas, ise_giris_tarihi")
    .returns<MaasYilPersonel[]>();
  const personelListesi = personelSonucu ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Personel Maaş</h1>
          <p className="text-sm text-muted-foreground">
            Yıllara göre, kategori (görev) bazında sabit maaş toplamları.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Yıllara Göre Genel Maaş Tablosu</CardTitle>
          </CardHeader>
          <CardContent>
            <PersonelMaasYilTablosu personelListesi={personelListesi} yil={yil} yilSecenekleri={yilSecenekleri} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

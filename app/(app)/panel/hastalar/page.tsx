import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HastaSatir } from "@/types/hasta";
import { YeniHastaDialog } from "./yeni-hasta-dialog";
import { HastaSatiri } from "./hasta-satiri";
import { HastaAramaKutusu } from "./hasta-arama-kutusu";

export default async function HastalarSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { q } = await searchParams;
  const arama = q?.trim() ?? "";

  let sorgu = supabase
    .from("hasta")
    .select("id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu")
    .order("ad_soyad")
    .limit(50);

  if (arama) {
    const guvenliArama = arama.replace(/[,()%]/g, "");
    sorgu = sorgu.or(`ad_soyad.ilike.%${guvenliArama}%,telefon.ilike.%${guvenliArama}%`);
  }

  const { data, error } = await sorgu.returns<HastaSatir[]>();
  const hastalar = data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Hastalar</h1>
            <p className="text-sm text-muted-foreground">
              Hasta kayıtlarını görüntüle, ekle ve düzenle.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href="/panel/hastalar/kayit-formu" target="_blank">
                  <FileText /> Kayıt Formu (PDF)
                </Link>
              }
            />
            <YeniHastaDialog />
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Kayıtlı Hastalar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <HastaAramaKutusu baslangic={arama} />

            {error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!error && hastalar.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {arama ? "Aramayla eşleşen hasta yok." : "Henüz hasta kaydı yok."}
              </p>
            )}
            {!error && hastalar.length > 0 && (
              <ul className="flex flex-col gap-2">
                {hastalar.map((hasta) => (
                  <HastaSatiri key={hasta.id} hasta={hasta} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

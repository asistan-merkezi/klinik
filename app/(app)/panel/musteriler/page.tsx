import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MusteriSatir } from "@/types/musteri";
import { MusteriFormu } from "./musteri-formu";
import { MusteriSatiri } from "./musteri-satiri";
import { MusteriAramaKutusu } from "./musteri-arama-kutusu";

export default async function MusterilerSayfasi({
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
    .from("musteri")
    .select("id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu")
    .order("ad_soyad")
    .limit(50);

  if (arama) {
    const guvenliArama = arama.replace(/[,()%]/g, "");
    sorgu = sorgu.or(`ad_soyad.ilike.%${guvenliArama}%,telefon.ilike.%${guvenliArama}%`);
  }

  const { data, error } = await sorgu.returns<MusteriSatir[]>();
  const musteriler = data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Müşteriler</h1>
            <p className="text-sm text-muted-foreground">
              Hasta kayıtlarını görüntüle, ekle ve düzenle.
            </p>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href="/panel/musteriler/kayit-formu" target="_blank">
                <FileText /> Kayıt Formu (PDF)
              </Link>
            }
          />
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Yeni Müşteri</CardTitle>
          </CardHeader>
          <CardContent>
            <MusteriFormu />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kayıtlı Müşteriler</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <MusteriAramaKutusu baslangic={arama} />

            {error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!error && musteriler.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {arama ? "Aramayla eşleşen müşteri yok." : "Henüz müşteri kaydı yok."}
              </p>
            )}
            {!error && musteriler.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {musteriler.map((musteri) => (
                  <MusteriSatiri key={musteri.id} musteri={musteri} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

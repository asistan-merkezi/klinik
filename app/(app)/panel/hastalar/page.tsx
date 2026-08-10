import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { HastaListeSatiri } from "@/types/hasta";
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
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, eposta, hasta_hassas(adres)"
    )
    .order("ad_soyad")
    .limit(50);

  if (arama) {
    const guvenliArama = arama.replace(/[,()%]/g, "");
    sorgu = sorgu.or(`ad_soyad.ilike.%${guvenliArama}%,telefon.ilike.%${guvenliArama}%`);
  }

  const { data, error } = await sorgu.returns<Omit<HastaListeSatiri, "bakiye">[]>();
  const hastalarHam = data ?? [];

  const hastaIdler = hastalarHam.map((h) => h.id);
  const { data: bakiyeVerisi } =
    hastaIdler.length > 0
      ? await supabase.from("v_hasta_ozet").select("hasta_id, bakiye").in("hasta_id", hastaIdler)
      : { data: [] as { hasta_id: string; bakiye: number }[] };
  const bakiyeMap = new Map((bakiyeVerisi ?? []).map((b) => [b.hasta_id, b.bakiye]));

  const hastalar: HastaListeSatiri[] = hastalarHam.map((h) => ({
    ...h,
    bakiye: bakiyeMap.get(h.id) ?? 0,
  }));

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24 sm:max-w-3xl sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Hastalar</h1>
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

        <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur-sm sm:mx-0 sm:px-0">
          <HastaAramaKutusu baslangic={arama} />
        </div>

        {error && (
          <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
        )}
        {!error && hastalar.length === 0 && (
          <EmptyState
            icon={Users}
            title={arama ? "Aramayla eşleşen hasta yok." : "Henüz hasta kaydı yok."}
          />
        )}
        {!error && hastalar.length > 0 && (
          <ul className="flex flex-col gap-3">
            {hastalar.map((hasta, i) => (
              <HastaSatiri key={hasta.id} hasta={hasta} gecikme={i * 40} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

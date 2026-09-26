import { redirect } from "next/navigation";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemAdimiSablonuListSatir } from "@/types/islem-tanimi";
import { YeniIslemSablonuDialog } from "../yeni-islem-sablonu-dialog";
import { SablonListesi } from "./sablon-listesi";

export default async function IslemTanimlamalarSayfasi() {
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

  const duzenlenebilir = kullanici?.rol === "klinik_admin";

  const [pozisyonSonucu, sablonSonucu] = await Promise.all([
    supabase.from("pozisyonlar").select("id, ad").eq("aktif", true).order("sira"),
    supabase
      .from("islem_adimi_sablonu")
      .select("id, ad, uygulayici_pozisyon_id, sure_dakika, aktif, pozisyon:uygulayici_pozisyon_id(ad)")
      .order("ad")
      .returns<IslemAdimiSablonuListSatir[]>(),
  ]);

  const pozisyonlar: SecenekSatir[] = (pozisyonSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad }));
  const sablonlar = sablonSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="İşlem Tanımlama"
          breadcrumb={
            <Link href="/panel/islemler" className="hover:underline">
              ‹ Tedavi Tanımları
            </Link>
          }
          description="Tedavi adımlarında yeniden kullanılabilir işlem kataloğu — ad, uygulayacak kişi ve süre."
          icon={ListChecks}
          actions={duzenlenebilir && <YeniIslemSablonuDialog pozisyonlar={pozisyonlar} />}
        />

        <Card className="bg-surface-2">
          <CardHeader>
            <CardTitle>Kayıtlı İşlem Tanımları</CardTitle>
          </CardHeader>
          <CardContent>
            {sablonSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!sablonSonucu.error && sablonlar.length === 0 && (
              <EmptyState icon={ListChecks} title="Henüz işlem tanımı yok." compact />
            )}
            {!sablonSonucu.error && sablonlar.length > 0 && (
              <SablonListesi sablonlar={sablonlar} pozisyonlar={pozisyonlar} duzenlenebilir={duzenlenebilir} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

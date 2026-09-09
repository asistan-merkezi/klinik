import { redirect } from "next/navigation";
import { PackageOpen, Archive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { SecenekSatir } from "@/types/randevu";
import type { PaketSatir, SatisHastaSecenegi } from "@/types/paket";
import { paketArsivdeMi } from "@/lib/paket/satis-suresi";
import { YeniPaketDialog } from "./yeni-paket-dialog";
import { PaketSatiri } from "./paket-satiri";

export default async function PaketlerSayfasi() {
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
  const satisYapabilir = kullanici?.rol === "klinik_admin" || kullanici?.rol === "resepsiyon";

  const [islemTanimiSonucu, paketSonucu, hastaSonucu] = await Promise.all([
    supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
    supabase
      .from("paket")
      .select(
        "id, ad, seans_sayisi, satis_bitis_tarihi, fiyat, kdv_orani, aktif, tekrar_sayisi, kisi_kotasi, islem_tanimi(ad)"
      )
      .order("ad")
      .returns<PaketSatir[]>(),
    supabase.from("hasta").select("id, ad_soyad, kategori").order("ad_soyad"),
  ]);

  const islemTanimlari: SecenekSatir[] = (islemTanimiSonucu.data ?? []).map((i) => ({
    id: i.id,
    ad: i.ad,
  }));
  const paketler = paketSonucu.data ?? [];
  const guncelPaketler = paketler.filter((p) => !paketArsivdeMi(p));
  const arsivPaketler = paketler.filter((p) => paketArsivdeMi(p));
  const hastalar: SatisHastaSecenegi[] = (hastaSonucu.data ?? []).map((h) => ({
    id: h.id,
    ad: h.ad_soyad,
    kategori: h.kategori,
  }));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Paketler"
          description="Hastalara satılabilecek seans paketlerini yönet."
          icon={PackageOpen}
          actions={duzenlenebilir && <YeniPaketDialog islemTanimlari={islemTanimlari} />}
        />

        <Card>
          <CardHeader>
            <CardTitle>Güncel Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {paketSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!paketSonucu.error && guncelPaketler.length === 0 && (
              <EmptyState icon={PackageOpen} title="Henüz paket yok." compact />
            )}
            {!paketSonucu.error && guncelPaketler.length > 0 && (
              <ul className="flex flex-col gap-3">
                {guncelPaketler.map((paket, i) => (
                  <PaketSatiri
                    key={paket.id}
                    paket={paket}
                    islemTanimlari={islemTanimlari}
                    duzenlenebilir={duzenlenebilir}
                    satisYapabilir={satisYapabilir}
                    hastalar={hastalar}
                    gecikme={i * 40}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Arşiv Paketler</CardTitle>
          </CardHeader>
          <CardContent>
            {!paketSonucu.error && arsivPaketler.length === 0 && (
              <EmptyState icon={Archive} title="Arşivde paket yok." compact />
            )}
            {!paketSonucu.error && arsivPaketler.length > 0 && (
              <ul className="flex flex-col gap-3">
                {arsivPaketler.map((paket, i) => (
                  <PaketSatiri
                    key={paket.id}
                    paket={paket}
                    islemTanimlari={islemTanimlari}
                    duzenlenebilir={duzenlenebilir}
                    satisYapabilir={satisYapabilir}
                    hastalar={hastalar}
                    gecikme={i * 40}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

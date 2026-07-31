import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import type { BekleyenIptalTalebiSatir } from "@/types/portal";
import { gunAraligi } from "@/lib/utils";
import { CanliCizelge } from "@/components/panel/canli-cizelge";
import { YeniRandevuDialog } from "./yeni-randevu-dialog";
import { PeriyodikRandevuDialog } from "./periyodik-randevu-dialog";
import { BekleyenIptalTalepleri } from "./bekleyen-iptal-talepleri";

export default async function RandevularSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { baslangic, bitis } = gunAraligi();

  const [
    randevularSonucu,
    hastaSonucu,
    terapistSonucu,
    odaSonucu,
    cihazSonucu,
    tedaviSonucu,
    iptalTalepleriSonucu,
  ] = await Promise.all([
      supabase
        .from("randevu")
        .select(
          "id, baslangic, bitis, durum, gecikme_dakika, hasta_id, terapist_id, oda_id, cihaz_id, hasta(ad_soyad), oda(ad), terapist(personel(ad_soyad)), islem_tanimi_id, islem_tanimi(id, ad)"
        )
        .gte("baslangic", baslangic)
        .lt("baslangic", bitis)
        .order("baslangic")
        .returns<RandevuSatir[]>(),
      supabase.from("hasta").select("id, ad_soyad").order("ad_soyad"),
      supabase
        .from("terapist")
        .select("id, personel(ad_soyad)")
        .returns<{ id: string; personel: { ad_soyad: string } | null }[]>(),
      supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
      supabase
        .from("randevu_iptal_talebi")
        .select("id, durum, created_at, randevu(id, baslangic, durum, hasta(ad_soyad))")
        .eq("durum", "bekliyor")
        .order("created_at")
        .returns<BekleyenIptalTalebiSatir[]>(),
    ]);

  const randevular = randevularSonucu.data ?? [];
  const bekleyenIptalTalepleri = iptalTalepleriSonucu.data ?? [];
  const hastalar: SecenekSatir[] = (hastaSonucu.data ?? []).map((m) => ({
    id: m.id,
    ad: m.ad_soyad,
  }));
  const terapistler: SecenekSatir[] = (terapistSonucu.data ?? [])
    .map((t) => ({ id: t.id, ad: t.personel?.ad_soyad ?? "—" }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  const odalar: SecenekSatir[] = (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad }));
  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
  const tedaviler: SecenekSatir[] = (tedaviSonucu.data ?? []).map((t) => ({ id: t.id, ad: t.ad }));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Randevular</h1>
            <p className="text-sm text-muted-foreground">
              Çizelgede tarih gezinerek geçmiş/gelecek randevuları görüntüle, yeni randevu oluştur.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <PeriyodikRandevuDialog
              hastalar={hastalar}
              terapistler={terapistler}
              odalar={odalar}
              cihazlar={cihazlar}
              tedaviler={tedaviler}
            />
            <YeniRandevuDialog
              hastalar={hastalar}
              terapistler={terapistler}
              odalar={odalar}
              cihazlar={cihazlar}
              tedaviler={tedaviler}
            />
          </div>
        </header>

        {bekleyenIptalTalepleri.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bekleyen İptal Talepleri</CardTitle>
            </CardHeader>
            <CardContent>
              <BekleyenIptalTalepleri talepler={bekleyenIptalTalepleri} />
            </CardContent>
          </Card>
        )}

        {randevularSonucu.error ? (
          <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
        ) : (
          <CanliCizelge
            baslangicRandevular={randevular}
            odalar={odalar}
            terapistler={terapistler}
            cihazlar={cihazlar}
            tedaviler={tedaviler}
            tarihNavigasyonuGoster
          />
        )}
      </div>
    </div>
  );
}

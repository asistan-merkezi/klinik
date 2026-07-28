import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import type { BekleyenIptalTalebiSatir } from "@/types/portal";
import { RandevuFormu } from "./randevu-formu";
import { RandevuSatiri } from "./randevu-satiri";
import { BekleyenIptalTalepleri } from "./bekleyen-iptal-talepleri";

export default async function RandevularSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const [
    randevularSonucu,
    musteriSonucu,
    terapistSonucu,
    odaSonucu,
    cihazSonucu,
    tedaviSonucu,
    iptalTalepleriSonucu,
  ] = await Promise.all([
      supabase
        .from("randevu")
        .select(
          "id, baslangic, bitis, durum, created_at, musteri_id, musteri(ad_soyad), terapist_id, terapist(personel(ad_soyad)), oda_id, oda(ad), cihaz_id, islem_tanimi_id, islem_tanimi(id, ad), olusturan_kullanici:olusturan_kullanici_id(ad_soyad)"
        )
        .gte("bitis", new Date().toISOString())
        .order("baslangic")
        .limit(50)
        .returns<RandevuSatir[]>(),
      supabase.from("musteri").select("id, ad_soyad").order("ad_soyad"),
      supabase
        .from("terapist")
        .select("id, personel(ad_soyad)")
        .returns<{ id: string; personel: { ad_soyad: string } | null }[]>(),
      supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
      supabase
        .from("randevu_iptal_talebi")
        .select("id, durum, created_at, randevu(id, baslangic, durum, musteri(ad_soyad))")
        .eq("durum", "bekliyor")
        .order("created_at")
        .returns<BekleyenIptalTalebiSatir[]>(),
    ]);

  const randevular = randevularSonucu.data ?? [];
  const bekleyenIptalTalepleri = iptalTalepleriSonucu.data ?? [];
  const musteriler: SecenekSatir[] = (musteriSonucu.data ?? []).map((m) => ({
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
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Randevular</h1>
          <p className="text-sm text-muted-foreground">
            Yaklaşan randevuları görüntüle ve yeni randevu oluştur.
          </p>
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

        <Card>
          <CardHeader>
            <CardTitle>Yeni Randevu</CardTitle>
          </CardHeader>
          <CardContent>
            {musteriler.length === 0 ||
            terapistler.length === 0 ||
            odalar.length === 0 ||
            tedaviler.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Randevu oluşturabilmek için önce müşteri, terapist, oda ve tedavi tanımı kaydı gerekli.
              </p>
            ) : (
              <RandevuFormu
                musteriler={musteriler}
                terapistler={terapistler}
                odalar={odalar}
                cihazlar={cihazlar}
                tedaviler={tedaviler}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Yaklaşan Randevular</CardTitle>
          </CardHeader>
          <CardContent>
            {randevularSonucu.error && (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            )}
            {!randevularSonucu.error && randevular.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Yaklaşan randevu yok.
              </p>
            )}
            {!randevularSonucu.error && randevular.length > 0 && (
              <ul className="flex flex-col divide-y divide-border">
                {randevular.map((randevu) => (
                  <RandevuSatiri
                    key={randevu.id}
                    randevu={randevu}
                    musteriler={musteriler}
                    terapistler={terapistler}
                    odalar={odalar}
                    cihazlar={cihazlar}
                    tedaviler={tedaviler}
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

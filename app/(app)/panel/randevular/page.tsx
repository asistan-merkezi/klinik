import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import type { BekleyenIptalTalebiSatir, BekleyenRandevuTalebiSatir } from "@/types/portal";
import { gunAraligi } from "@/lib/utils";
import { CanliCizelge } from "@/components/panel/canli-cizelge";
import { YeniRandevuDialog } from "./yeni-randevu-dialog";
import { BekleyenIptalTalepleri } from "./bekleyen-iptal-talepleri";
import { BekleyenRandevuTalepleri } from "./bekleyen-randevu-talepleri";

export default async function RandevularSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();
  const rol = kullanici?.rol ?? null;

  let kendiTerapistId: string | null = null;
  if (rol === "terapist") {
    const { data: personel } = await supabase
      .from("personel")
      .select("id")
      .eq("kullanici_id", user.id)
      .maybeSingle();
    if (personel) {
      const { data: terapist } = await supabase
        .from("terapist")
        .select("id")
        .eq("personel_id", personel.id)
        .maybeSingle();
      kendiTerapistId = terapist?.id ?? null;
    }
  }

  const { baslangic, bitis } = gunAraligi();

  const [
    randevularSonucu,
    hastaSonucu,
    terapistSonucu,
    odaSonucu,
    cihazSonucu,
    tedaviSonucu,
    personelSonucu,
    protokolSonucu,
    iptalTalepleriSonucu,
    randevuTalepleriSonucu,
  ] = await Promise.all([
      supabase
        .from("randevu")
        .select(
          "id, baslangic, bitis, durum, gecikme_dakika, hasta_id, terapist_id, oda_id, cihaz_id, hasta(ad_soyad), oda(ad), terapist(personel(ad_soyad)), islem_tanimi_id, islem_tanimi(id, ad), tani, antrenor_id, antrenor:personel(ad_soyad), tedavi_protokolu_id, tedavi_protokolu(id, ad)"
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
      supabase.from("personel").select("id, ad_soyad").eq("aktif", true).order("ad_soyad"),
      supabase.from("tedavi_protokolu").select("id, ad").eq("aktif", true).order("ad"),
      supabase
        .from("randevu_iptal_talebi")
        .select("id, durum, created_at, randevu(id, baslangic, durum, hasta(ad_soyad))")
        .eq("durum", "bekliyor")
        .order("created_at")
        .returns<BekleyenIptalTalebiSatir[]>(),
      supabase
        .from("randevu_talebi")
        .select("id, hasta_id, islem_tanimi_id, tercih_tarih, tercih_saat, not_metni, created_at, hasta(ad_soyad), islem_tanimi(ad)")
        .eq("durum", "bekliyor")
        .order("created_at")
        .returns<BekleyenRandevuTalebiSatir[]>(),
    ]);

  const randevular = randevularSonucu.data ?? [];
  const bekleyenIptalTalepleri = iptalTalepleriSonucu.data ?? [];
  const bekleyenRandevuTalepleri = randevuTalepleriSonucu.data ?? [];
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
  const antrenorler: SecenekSatir[] = (personelSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad_soyad }));
  const protokoller: SecenekSatir[] = (protokolSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad }));

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

        {bekleyenRandevuTalepleri.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bekleyen Randevu Talepleri</CardTitle>
            </CardHeader>
            <CardContent>
              <BekleyenRandevuTalepleri
                talepler={bekleyenRandevuTalepleri}
                hastalar={hastalar}
                terapistler={terapistler}
                odalar={odalar}
                cihazlar={cihazlar}
                tedaviler={tedaviler}
              />
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
            antrenorler={antrenorler}
            protokoller={protokoller}
            tarihNavigasyonuGoster
            rol={rol}
            kendiTerapistId={kendiTerapistId}
          />
        )}
      </div>
    </div>
  );
}

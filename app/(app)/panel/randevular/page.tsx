import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import type { BekleyenIptalTalebiSatir, BekleyenRandevuTalebiSatir } from "@/types/portal";
import type { KlinikBankaHesabi } from "@/types/klinik";
import { gunAraligi } from "@/lib/utils";
import { CanliCizelge } from "@/components/panel/canli-cizelge";
import { YeniRandevuDialog } from "./yeni-randevu-dialog";
import { BekleyenIptalTalepleri } from "./bekleyen-iptal-talepleri";
import { BekleyenRandevuTalepleri } from "./bekleyen-randevu-talepleri";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { atanabilirTerapistleriGetir } from "@/lib/personel/atanabilir-terapistler";
import { tedaviSecenekleriGetir } from "@/lib/randevu/tedavi-secenekleri";
import { RANDEVU_SELECT } from "@/lib/randevu/queries";

export default async function RandevularSayfasi() {
  const supabase = await createClient();

  const oturum = await gecerliKullanici();
  if (!oturum) {
    redirect("/giris");
  }
  const { authUser: user, kullanici } = oturum;
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
    terapistler,
    odaSonucu,
    cihazSonucu,
    tedaviler,
    personelSonucu,
    protokolSonucu,
    iptalTalepleriSonucu,
    randevuTalepleriSonucu,
    bankaHesabiSonucu,
  ] = await Promise.all([
      supabase
        .from("randevu")
        .select(RANDEVU_SELECT)
        .gte("baslangic", baslangic)
        .lt("baslangic", bitis)
        .order("baslangic")
        .returns<RandevuSatir[]>(),
      atanabilirTerapistleriGetir(supabase),
      supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
      tedaviSecenekleriGetir(supabase),
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
      supabase
        .from("klinik_banka_hesaplari")
        .select("id, banka_adi, sube")
        .order("sort_order")
        .returns<KlinikBankaHesabi[]>(),
    ]);

  const randevular = randevularSonucu.data ?? [];
  const bekleyenIptalTalepleri = iptalTalepleriSonucu.data ?? [];
  const bekleyenRandevuTalepleri = randevuTalepleriSonucu.data ?? [];
  const odalar: SecenekSatir[] = (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad }));
  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
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
            bankaHesaplari={bankaHesabiSonucu.data ?? []}
            tarihNavigasyonuGoster
            rol={rol}
            kendiTerapistId={kendiTerapistId}
          />
        )}
      </div>
    </div>
  );
}

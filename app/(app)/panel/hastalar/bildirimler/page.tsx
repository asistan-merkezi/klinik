import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Bell } from "lucide-react";
import type { SecenekSatir } from "@/types/randevu";
import type {
  AnketYanitiSatir,
  BekleyenIptalTalebiSatir,
  BekleyenRandevuTalebiSatir,
  SeansDegerlendirmeSatir,
} from "@/types/portal";
import { BekleyenIptalTalepleri } from "../../randevular/bekleyen-iptal-talepleri";
import { BekleyenRandevuTalepleri } from "../../randevular/bekleyen-randevu-talepleri";
import { AnketYanitiListesi, SeansDegerlendirmeListesi } from "./geri-bildirim-listesi";
import { GoruluIsaretleyici } from "./goruldu-isaretleyici";

export default async function HastaBildirimleriSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin" && kullanici?.rol !== "resepsiyon") {
    redirect("/panel/hastalar");
  }

  const [
    iptalTalepleriSonucu,
    randevuTalepleriSonucu,
    anketSonucu,
    seansDegerlendirmeSonucu,
    hastaSonucu,
    terapistSonucu,
    odaSonucu,
    cihazSonucu,
    tedaviSonucu,
  ] = await Promise.all([
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
      .from("anket_yaniti")
      .select("id, puan, oneri_metni, ad_soyad, telefon, created_at, goruldu_tarihi")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<AnketYanitiSatir[]>(),
    supabase
      .from("seans_degerlendirme")
      .select("id, puan, oneri_metni, created_at, goruldu_tarihi, hasta(ad_soyad), randevu(baslangic, terapist(personel(ad_soyad)))")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<SeansDegerlendirmeSatir[]>(),
    supabase.from("hasta").select("id, ad_soyad").order("ad_soyad"),
    supabase
      .from("terapist")
      .select("id, personel(ad_soyad)")
      .returns<{ id: string; personel: { ad_soyad: string } | null }[]>(),
    supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
  ]);

  const bekleyenIptalTalepleri = iptalTalepleriSonucu.data ?? [];
  const bekleyenRandevuTalepleri = randevuTalepleriSonucu.data ?? [];
  const anketYanitlari = anketSonucu.data ?? [];
  const seansDegerlendirmeleri = seansDegerlendirmeSonucu.data ?? [];

  const hastalar: SecenekSatir[] = (hastaSonucu.data ?? []).map((m) => ({ id: m.id, ad: m.ad_soyad }));
  const terapistler: SecenekSatir[] = (terapistSonucu.data ?? [])
    .map((t) => ({ id: t.id, ad: t.personel?.ad_soyad ?? "—" }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  const odalar: SecenekSatir[] = (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad }));
  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
  const tedaviler: SecenekSatir[] = (tedaviSonucu.data ?? []).map((t) => ({ id: t.id, ad: t.ad }));

  const hicBirSeyYok =
    bekleyenIptalTalepleri.length === 0 &&
    bekleyenRandevuTalepleri.length === 0 &&
    anketYanitlari.length === 0 &&
    seansDegerlendirmeleri.length === 0;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Bildirimler</h1>
          <p className="text-sm text-muted-foreground">
            Hastaların portaldan gönderdiği randevu talep/iptal talepleri, seans sonu değerlendirmeleri ve Anket ve
            Öneriler yanıtları.
          </p>
        </header>

        {hicBirSeyYok && <EmptyState icon={Bell} title="Henüz bildirim yok." />}

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

        {seansDegerlendirmeleri.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Seans Değerlendirmeleri</CardTitle>
            </CardHeader>
            <CardContent>
              <SeansDegerlendirmeListesi degerlendirmeler={seansDegerlendirmeleri} />
            </CardContent>
          </Card>
        )}

        {anketYanitlari.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Anket ve Öneriler</CardTitle>
            </CardHeader>
            <CardContent>
              <AnketYanitiListesi yanitlar={anketYanitlari} />
            </CardContent>
          </Card>
        )}
      </div>

      <GoruluIsaretleyici
        anketIdleri={anketYanitlari.map((a) => a.id)}
        seansIdleri={seansDegerlendirmeleri.map((s) => s.id)}
      />
    </div>
  );
}

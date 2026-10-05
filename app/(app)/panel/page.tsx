import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import type { RandevuSatir, SecenekSatir, TerapistSecenekSatir } from "@/types/randevu";
import { tedaviSecenekleriGetir } from "@/lib/randevu/tedavi-secenekleri";
import { RANDEVU_SELECT } from "@/lib/randevu/queries";
import type { BekleyenIptalTalebiSatir, BekleyenRandevuTalebiSatir } from "@/types/portal";
import type { KlinikBankaHesabi } from "@/types/klinik";
import { gunAraligi } from "@/lib/utils";
import { CanliCizelge } from "@/components/panel/canli-cizelge";
import { BekleyenIptalTalepleri } from "@/app/(app)/panel/randevular/bekleyen-iptal-talepleri";
import { BekleyenRandevuTalepleri } from "@/app/(app)/panel/randevular/bekleyen-randevu-talepleri";
import { gorunumDurumuHesapla } from "@/components/panel/randevu-kutusu";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { YeniRandevuDialog } from "@/app/(app)/panel/randevular/yeni-randevu-dialog";
import { YeniHastaDialog } from "@/app/(app)/panel/hastalar/yeni-hasta-dialog";
import { CalendarClock, Inbox } from "lucide-react";

const KARSILAMA_TARIH_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function PanelSayfasi() {
  const supabase = await createClient();

  const oturum = await gecerliKullanici();
  if (!oturum) {
    redirect("/giris");
  }
  const { authUser: user, kullanici } = oturum;
  const rol = kullanici?.rol ?? null;
  const finansalGorunur = rol === "klinik_admin" || rol === "resepsiyon" || rol === "super_admin";

  const { data: klinik } = await supabase
    .from("klinik")
    .select("ad")
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle();

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
    odaSonucu,
    terapistSonucu,
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
    supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
    supabase
      .from("terapist")
      .select("id, personel(ad_soyad, pozisyon_id)")
      .returns<{ id: string; personel: { ad_soyad: string; pozisyon_id: string | null } | null }[]>(),
    supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
    tedaviSecenekleriGetir(supabase),
    supabase.from("personel").select("id, ad_soyad").eq("aktif", true).order("ad_soyad"),
    supabase.from("tedavi_protokolu").select("id, ad").eq("aktif", true).order("ad"),
    finansalGorunur
      ? supabase
          .from("randevu_iptal_talebi")
          .select("id, durum, created_at, randevu(id, baslangic, durum, hasta(ad_soyad))")
          .eq("durum", "bekliyor")
          .order("created_at")
          .returns<BekleyenIptalTalebiSatir[]>()
      : Promise.resolve({ data: [] as BekleyenIptalTalebiSatir[] }),
    finansalGorunur
      ? supabase
          .from("randevu_talebi")
          .select(
            "id, hasta_id, islem_tanimi_id, tercih_tarih, tercih_saat, not_metni, created_at, hasta(ad_soyad), islem_tanimi(ad)"
          )
          .eq("durum", "bekliyor")
          .order("created_at")
          .returns<BekleyenRandevuTalebiSatir[]>()
      : Promise.resolve({ data: [] as BekleyenRandevuTalebiSatir[] }),
    finansalGorunur
      ? supabase
          .from("klinik_banka_hesaplari")
          .select("id, banka_adi, sube")
          .order("sort_order")
          .returns<KlinikBankaHesabi[]>()
      : Promise.resolve({ data: [] as KlinikBankaHesabi[] }),
  ]);

  const { data: randevular, error } = randevularSonucu;
  const odalar: SecenekSatir[] = (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad }));
  const terapistler: TerapistSecenekSatir[] = (terapistSonucu.data ?? [])
    .map((t) => ({ id: t.id, ad: t.personel?.ad_soyad ?? "—", pozisyon_id: t.personel?.pozisyon_id ?? null }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
  const antrenorler: SecenekSatir[] = (personelSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad_soyad }));
  const protokoller: SecenekSatir[] = (protokolSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad }));
  const bekleyenIptalTalepleri = iptalTalepleriSonucu.data ?? [];
  const bekleyenRandevuTalepleri = randevuTalepleriSonucu.data ?? [];
  if (error) {
    console.error("Bugünkü randevular çekilemedi:", error);
  }

  const bugunkuRandevuSayisi = randevular?.length ?? 0;
  const bugunkuTamamlanan = (randevular ?? []).filter((r) =>
    ["geldi", "gecikmeli_geldi", "tamamlandi"].includes(r.durum)
  ).length;
  const bekleyenTalepSayisi = bekleyenIptalTalepleri.length + bekleyenRandevuTalepleri.length;

  // Terapist Durumları — bugünkü randevulardan (zaten sunucuda çekildi, ayrı
  // sorgu gerekmedi) o an "seansta" olan terapistler türetiliyor. CanliCizelge
  // gibi saniye saniye canlı DEĞİL, sayfa yüklendiği/gezinildiği andaki durumu
  // yansıtır — ayrı bir realtime abonelik açmamak için bilinçli bir basitleştirme.
  const simdi = new Date();
  const terapistDurumu = terapistler.map((t) => {
    const aktifRandevu = (randevular ?? []).find(
      (r) => r.terapist_id === t.id && gorunumDurumuHesapla(r, simdi) === "seansta"
    );
    return { terapist: t, mesgul: Boolean(aktifRandevu), oda: aktifRandevu?.oda?.ad ?? null };
  });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <PageHeader
          title={`İyi çalışmalar, ${kullanici?.ad_soyad ?? ""}`}
          description={`${KARSILAMA_TARIH_FORMAT.format(simdi)}${klinik?.ad ? ` · ${klinik.ad}` : ""} · Bugün ${bugunkuRandevuSayisi} randevu planlandı.`}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Bugünkü Seanslar"
            value={`${bugunkuTamamlanan} / ${bugunkuRandevuSayisi}`}
            icon={CalendarClock}
            iconTone="emerald"
          />
          {finansalGorunur && (
            <KpiCard label="Bekleyen Talepler" value={bekleyenTalepSayisi} icon={Inbox} iconTone="amber" />
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {error ? (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            ) : (
              <CanliCizelge
                baslangicRandevular={randevular ?? []}
                odalar={odalar}
                terapistler={terapistler}
                cihazlar={cihazlar}
                tedaviler={tedaviler}
                antrenorler={antrenorler}
                protokoller={protokoller}
                bankaHesaplari={bankaHesabiSonucu.data ?? []}
                rol={rol}
                kendiTerapistId={kendiTerapistId}
              />
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Terapist Durumları</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {terapistDurumu.length === 0 ? (
                  <EmptyState compact title="Kayıtlı terapist yok" />
                ) : (
                  terapistDurumu.map(({ terapist, mesgul, oda }) => (
                    <div key={terapist.id} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar name={terapist.ad} size="sm" />
                        <span className="truncate text-sm font-medium">{terapist.ad}</span>
                      </div>
                      {mesgul ? (
                        <StatusBadge tone="teal" pulse>
                          Meşgul{oda ? ` (${oda})` : ""}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="emerald">Müsait</StatusBadge>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {finansalGorunur && bekleyenRandevuTalepleri.length > 0 && (
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

            {finansalGorunur && bekleyenIptalTalepleri.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Bekleyen İptal Talepleri</CardTitle>
                </CardHeader>
                <CardContent>
                  <BekleyenIptalTalepleri talepler={bekleyenIptalTalepleri} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {finansalGorunur && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Hızlı Resepsiyon İşlemleri
            </h2>
            <div className="flex flex-wrap gap-3">
              <YeniRandevuDialog
                kartGorunumu
                buttonLabel="Yeni Randevu"
                terapistler={terapistler}
                odalar={odalar}
                cihazlar={cihazlar}
                tedaviler={tedaviler}
              />
              <YeniHastaDialog kartGorunumu buttonLabel="Yeni Kayıt" />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

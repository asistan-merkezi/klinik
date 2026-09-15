import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import type { BekleyenIptalTalebiSatir, BekleyenRandevuTalebiSatir } from "@/types/portal";
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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
    tedaviSonucu,
    personelSonucu,
    protokolSonucu,
    hastaSonucu,
    iptalTalepleriSonucu,
    randevuTalepleriSonucu,
    aktifTakipSonucu,
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
    supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
    supabase
      .from("terapist")
      .select("id, personel(ad_soyad)")
      .returns<{ id: string; personel: { ad_soyad: string } | null }[]>(),
    supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("personel").select("id, ad_soyad").eq("aktif", true).order("ad_soyad"),
    supabase.from("tedavi_protokolu").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("hasta").select("id, ad_soyad").order("ad_soyad"),
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
    supabase
      .from("v_hasta_detay_ozet")
      // NOT: v_hasta_detay_ozet bir view olduğu için PostgREST'in FK-tabanlı
      // otomatik embed'i (hasta(ad_soyad)) çalışmıyor ("no relationship
      // found" hatası, gerçek Playwright doğrulamasında bulundu) — isim
      // aşağıda ayrı çekilen `hastaSonucu` listesinden Map ile eşleniyor.
      .select("hasta_id, kalan_paket_hakki, son_seans_tarihi, sonraki_randevu_tarihi, aktif_protokol_ad")
      .or("kalan_paket_hakki.gt.0,sonraki_randevu_tarihi.not.is.null")
      .order("son_seans_tarihi", { ascending: false, nullsFirst: false })
      .limit(8)
      .returns<
        {
          hasta_id: string;
          kalan_paket_hakki: number | null;
          son_seans_tarihi: string | null;
          sonraki_randevu_tarihi: string | null;
          aktif_protokol_ad: string | null;
        }[]
      >(),
  ]);

  const { data: randevular, error } = randevularSonucu;
  const odalar: SecenekSatir[] = (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad }));
  const terapistler: SecenekSatir[] = (terapistSonucu.data ?? [])
    .map((t) => ({ id: t.id, ad: t.personel?.ad_soyad ?? "—" }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
  const tedaviler: SecenekSatir[] = (tedaviSonucu.data ?? []).map((t) => ({ id: t.id, ad: t.ad }));
  const antrenorler: SecenekSatir[] = (personelSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad_soyad }));
  const protokoller: SecenekSatir[] = (protokolSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad }));
  const hastalar: SecenekSatir[] = (hastaSonucu.data ?? []).map((m) => ({ id: m.id, ad: m.ad_soyad }));
  const hastaAdHaritasi = new Map(hastalar.map((h) => [h.id, h.ad]));
  const bekleyenIptalTalepleri = iptalTalepleriSonucu.data ?? [];
  const bekleyenRandevuTalepleri = randevuTalepleriSonucu.data ?? [];
  const aktifTakip = aktifTakipSonucu.data ?? [];

  if (error) {
    console.error("Bugünkü randevular çekilemedi:", error);
  }
  if (aktifTakipSonucu.error) {
    console.error("Aktif takipteki hastalar çekilemedi:", aktifTakipSonucu.error);
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
                    hastalar={hastalar}
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

        <Card>
          <CardHeader>
            <CardTitle>Aktif Takipteki Hastalar</CardTitle>
          </CardHeader>
          <CardContent>
            {aktifTakip.length === 0 ? (
              <EmptyState title="Aktif takipte hasta yok" description="Kalan paket hakkı veya planlı randevusu olan hastalar burada listelenir." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hasta</TableHead>
                    <TableHead className="hidden md:table-cell">Aktif Protokol</TableHead>
                    <TableHead className="hidden sm:table-cell">Son Seans</TableHead>
                    <TableHead className="hidden md:table-cell">Sonraki Randevu</TableHead>
                    <TableHead className="text-right">Kalan Hak</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aktifTakip.map((satir) => {
                    const hastaAdi = hastaAdHaritasi.get(satir.hasta_id) ?? "—";
                    return (
                    <TableRow key={satir.hasta_id}>
                      <TableCell>
                        <Link href={`/panel/hastalar/${satir.hasta_id}/tedavi`} className="flex items-center gap-2 hover:underline">
                          <Avatar name={hastaAdi} size="sm" />
                          <span className="font-medium">{hastaAdi}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{satir.aktif_protokol_ad ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                        {satir.son_seans_tarihi ? new Date(satir.son_seans_tarihi).toLocaleDateString("tr-TR") : "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                        {satir.sonraki_randevu_tarihi ? new Date(satir.sonraki_randevu_tarihi).toLocaleDateString("tr-TR") : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{satir.kalan_paket_hakki ?? "—"}</TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

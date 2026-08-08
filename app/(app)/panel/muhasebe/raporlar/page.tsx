import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { raporAyDonemi, raporYilDonemi } from "@/lib/raporlar/donem";
import {
  hesaplaDigerGiderler,
  hesaplaFaturaliGiderler,
  hesaplaGelir,
  hesaplaIsletmeGideri,
  hesaplaMuhasebeGideri,
  hesaplaRandevuDurumOzeti,
  hesaplaSabitPersonelMaliyeti,
  hesaplaYillikOzet,
} from "@/lib/raporlar/hesaplamalar";
import { YillikGrafik } from "@/components/raporlar/yillik-grafik";
import { YazdirButonu } from "@/components/panel/yazdir-butonu";
import type { GelirOzeti, RandevuDurumOzeti, SabitPersonelMaliyeti } from "@/types/raporlar";

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export default async function RaporlarSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ gorunum?: string; yil?: string; ay?: string }>;
}) {
  const { gorunum: gorunumParam, yil: yilParam, ay: ayParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();

  const yetkili =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "muhasebe" || kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  const klinikId = kullanici?.klinik_id ?? "";

  const { data: klinik } = await supabase
    .from("klinik")
    .select("created_at")
    .eq("id", klinikId)
    .maybeSingle<{ created_at: string }>();

  const simdi = new Date();
  const buYil = simdi.getFullYear();
  const buAy = simdi.getMonth() + 1;
  const klinikBaslangicYili = klinik?.created_at ? new Date(klinik.created_at).getFullYear() : buYil;

  const gorunum = gorunumParam === "yillik" ? "yillik" : "aylik";
  const yil = Math.min(Math.max(parseInt(yilParam ?? "", 10) || buYil, klinikBaslangicYili), buYil);
  const ay = Math.min(Math.max(parseInt(ayParam ?? "", 10) || buAy, 1), 12);

  const oncekiAyTarih = new Date(Date.UTC(yil, ay - 2, 1));
  const sonrakiAyTarih = new Date(Date.UTC(yil, ay, 1));
  const oncekiAyGosterilebilir =
    oncekiAyTarih.getUTCFullYear() > klinikBaslangicYili ||
    (oncekiAyTarih.getUTCFullYear() === klinikBaslangicYili);
  const sonrakiAyGosterilebilir =
    sonrakiAyTarih.getUTCFullYear() < buYil ||
    (sonrakiAyTarih.getUTCFullYear() === buYil && sonrakiAyTarih.getUTCMonth() + 1 <= buAy);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8 print:bg-white print:p-0">
      <style>{`@media print { aside { display: none !important; } @page { margin: 12mm; } }`}</style>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 print:max-w-none">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">Raporlar</h1>
              <p className="text-sm text-muted-foreground">Gelir &amp; gider analizi.</p>
            </div>
            <div className="print:hidden">
              <YazdirButonu />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="inline-flex rounded-xl bg-muted/60 p-1 text-sm">
              <Link
                href="?gorunum=aylik"
                className={cn(
                  "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                  gorunum === "aylik"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Aylık
              </Link>
              <Link
                href={`?gorunum=yillik&yil=${yil}`}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                  gorunum === "yillik"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Yıllık
              </Link>
            </div>

            {gorunum === "aylik" ? (
              <div className="flex items-center gap-2 text-sm">
                {oncekiAyGosterilebilir ? (
                  <Link
                    className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60"
                    href={`?gorunum=aylik&yil=${oncekiAyTarih.getUTCFullYear()}&ay=${oncekiAyTarih.getUTCMonth() + 1}`}
                  >
                    ‹ Önceki
                  </Link>
                ) : (
                  <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">
                    ‹ Önceki
                  </span>
                )}
                <span className="min-w-32 text-center font-medium">
                  {raporAyDonemi(yil, ay).etiket}
                </span>
                {sonrakiAyGosterilebilir ? (
                  <Link
                    className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60"
                    href={`?gorunum=aylik&yil=${sonrakiAyTarih.getUTCFullYear()}&ay=${sonrakiAyTarih.getUTCMonth() + 1}`}
                  >
                    Sonraki ›
                  </Link>
                ) : (
                  <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">
                    Sonraki ›
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                {yil > klinikBaslangicYili ? (
                  <Link
                    className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60"
                    href={`?gorunum=yillik&yil=${yil - 1}`}
                  >
                    ‹ {yil - 1}
                  </Link>
                ) : (
                  <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">
                    ‹ {yil - 1}
                  </span>
                )}
                <span className="min-w-16 text-center font-medium">{yil}</span>
                {yil < buYil ? (
                  <Link
                    className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60"
                    href={`?gorunum=yillik&yil=${yil + 1}`}
                  >
                    {yil + 1} ›
                  </Link>
                ) : (
                  <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">
                    {yil + 1} ›
                  </span>
                )}
              </div>
            )}
          </div>
        </header>

        {gorunum === "aylik" ? (
          <AylikGorunum supabase={supabase} klinikId={klinikId} yil={yil} ay={ay} />
        ) : (
          <YillikGorunum supabase={supabase} klinikId={klinikId} yil={yil} />
        )}
      </div>
    </div>
  );
}

async function AylikGorunum({
  supabase,
  klinikId,
  yil,
  ay,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  klinikId: string;
  yil: number;
  ay: number;
}) {
  const donem = raporAyDonemi(yil, ay);

  const [sabitPersonel, isletmeGideri, faturaliGiderler, muhasebeGideri, digerGiderler, gelir, randevuDurumu] =
    await Promise.all([
      hesaplaSabitPersonelMaliyeti(supabase, klinikId, donem),
      hesaplaIsletmeGideri(supabase, klinikId, donem),
      hesaplaFaturaliGiderler(supabase, klinikId, donem),
      hesaplaMuhasebeGideri(supabase, klinikId, donem),
      hesaplaDigerGiderler(supabase, klinikId, donem),
      hesaplaGelir(supabase, klinikId, donem),
      hesaplaRandevuDurumOzeti(supabase, klinikId, donem),
    ]);

  const toplamGider =
    isletmeGideri + faturaliGiderler + muhasebeGideri + digerGiderler + sabitPersonel.toplamMaas;

  return (
    <div className="flex flex-col gap-4">
      <IstatistikKartlari
        toplamGelir={gelir.netTahsilat}
        toplamGider={toplamGider}
        tamamlananSayisi={randevuDurumu.tamamlanan}
      />
      <RandevuDurumBandi ozet={randevuDurumu} baslikEk={donem.etiket} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GelirDetayKarti gelir={gelir} />
        <GiderKalemleriKarti
          sabitPersonel={sabitPersonel}
          isletmeGideri={isletmeGideri}
          faturaliGiderler={faturaliGiderler}
          muhasebeGideri={muhasebeGideri}
          digerGiderler={digerGiderler}
          toplamGider={toplamGider}
        />
      </div>
      <NetKarZararKarti gelir={gelir.netTahsilat} gider={toplamGider} />
    </div>
  );
}

async function YillikGorunum({
  supabase,
  klinikId,
  yil,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  klinikId: string;
  yil: number;
}) {
  const donem = raporYilDonemi(yil);

  const [
    aylar,
    sabitPersonel,
    isletmeGideri,
    faturaliGiderler,
    muhasebeGideri,
    digerGiderler,
    gelir,
    randevuDurumu,
  ] = await Promise.all([
    hesaplaYillikOzet(supabase, klinikId, yil),
    hesaplaSabitPersonelMaliyeti(supabase, klinikId, donem),
    hesaplaIsletmeGideri(supabase, klinikId, donem),
    hesaplaFaturaliGiderler(supabase, klinikId, donem),
    hesaplaMuhasebeGideri(supabase, klinikId, donem),
    hesaplaDigerGiderler(supabase, klinikId, donem),
    hesaplaGelir(supabase, klinikId, donem),
    hesaplaRandevuDurumOzeti(supabase, klinikId, donem),
  ]);

  const toplamGider =
    isletmeGideri + faturaliGiderler + muhasebeGideri + digerGiderler + sabitPersonel.toplamMaas;

  return (
    <div className="flex flex-col gap-4">
      <IstatistikKartlari
        toplamGelir={gelir.netTahsilat}
        toplamGider={toplamGider}
        tamamlananSayisi={randevuDurumu.tamamlanan}
      />
      <RandevuDurumBandi ozet={randevuDurumu} baslikEk={donem.etiket} />

      <Card>
        <CardHeader>
          <CardTitle>{donem.etiket} — Aylık Gelir &amp; Gider</CardTitle>
        </CardHeader>
        <CardContent>
          <YillikGrafik aylar={aylar} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GelirDetayKarti gelir={gelir} />
        <GiderKalemleriKarti
          sabitPersonel={sabitPersonel}
          isletmeGideri={isletmeGideri}
          faturaliGiderler={faturaliGiderler}
          muhasebeGideri={muhasebeGideri}
          digerGiderler={digerGiderler}
          toplamGider={toplamGider}
        />
      </div>
      <NetKarZararKarti gelir={gelir.netTahsilat} gider={toplamGider} />
    </div>
  );
}

function IstatistikKartlari({
  toplamGelir,
  toplamGider,
  tamamlananSayisi,
}: {
  toplamGelir: number;
  toplamGider: number;
  tamamlananSayisi: number;
}) {
  const netKar = toplamGelir - toplamGider;
  const marj = toplamGelir > 0 ? (netKar / toplamGelir) * 100 : 0;
  const ortSeansGeliri = tamamlananSayisi > 0 ? toplamGelir / tamamlananSayisi : 0;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Toplam Gelir</p>
          <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {paraFormat(toplamGelir)}
          </p>
          <p className="text-xs text-muted-foreground">{tamamlananSayisi} seans</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Toplam Gider</p>
          <p className="text-2xl font-semibold text-rose-600 dark:text-rose-400">
            {paraFormat(toplamGider)}
          </p>
          <p className="text-xs text-muted-foreground">Tüm kalemler</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Net Kâr</p>
          <p
            className={cn(
              "text-2xl font-semibold",
              netKar >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}
          >
            {paraFormat(netKar)}
          </p>
          <p className="text-xs text-muted-foreground">%{marj.toFixed(0)} marj</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Ort. Seans Geliri</p>
          <p className="text-2xl font-semibold">{paraFormat(ortSeansGeliri)}</p>
          <p className="text-xs text-muted-foreground">{tamamlananSayisi} tamamlandı</p>
        </CardContent>
      </Card>
    </div>
  );
}

const DURUM_KALEM_SINIFI = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  primary: "bg-primary/10 text-primary",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
} as const;

function RandevuDurumBandi({ ozet, baslikEk }: { ozet: RandevuDurumOzeti; baslikEk: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Randevu Durumu — {baslikEk}
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DurumKalemi etiket="Tamamlandı" deger={ozet.tamamlanan} sinif={DURUM_KALEM_SINIFI.emerald} />
          <DurumKalemi etiket="Planlandı" deger={ozet.planlanan} sinif={DURUM_KALEM_SINIFI.primary} />
          <DurumKalemi etiket="Ertelendi" deger={ozet.ertelenen} sinif={DURUM_KALEM_SINIFI.sky} />
          <DurumKalemi etiket="İptal / Gelmedi" deger={ozet.iptalVeGelmedi} sinif={DURUM_KALEM_SINIFI.rose} />
        </div>
      </CardContent>
    </Card>
  );
}

function DurumKalemi({ etiket, deger, sinif }: { etiket: string; deger: number; sinif: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className={cn("flex size-14 items-center justify-center rounded-2xl text-lg font-semibold", sinif)}>
        {deger}
      </span>
      <span className="text-xs text-muted-foreground">{etiket}</span>
    </div>
  );
}

function GelirDetayKarti({ gelir }: { gelir: GelirOzeti }) {
  const kalemler = [
    { etiket: "KDV'li (brüt)", tutar: gelir.kdvli },
    { etiket: "KDV'siz (net)", tutar: gelir.kdvsiz },
    { etiket: "KDV tutarı", tutar: gelir.kdvTutari },
    { etiket: "İskonto", tutar: -gelir.iskontoToplam },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gelir Detayı</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col text-sm">
        {kalemler.map((kalem) => (
          <div
            key={kalem.etiket}
            className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0"
          >
            <dt className="text-muted-foreground">{kalem.etiket}</dt>
            <dd>{paraFormat(kalem.tutar)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between pt-3 font-semibold">
          <dt>Net Tahsilat</dt>
          <dd className="text-emerald-600 dark:text-emerald-400">{paraFormat(gelir.netTahsilat)}</dd>
        </div>
      </CardContent>
    </Card>
  );
}

function GiderKalemleriKarti({
  sabitPersonel,
  isletmeGideri,
  faturaliGiderler,
  muhasebeGideri,
  digerGiderler,
  toplamGider,
}: {
  sabitPersonel: SabitPersonelMaliyeti;
  isletmeGideri: number;
  faturaliGiderler: number;
  muhasebeGideri: number;
  digerGiderler: number;
  toplamGider: number;
}) {
  const kalemler = [
    { etiket: "Sabit Personel Gideri", tutar: sabitPersonel.sabitToplam },
    { etiket: "Extra Personel Gideri", tutar: sabitPersonel.ekstraToplam },
    { etiket: "İşletme Gideri", tutar: isletmeGideri },
    { etiket: "Faturalı Giderler", tutar: faturaliGiderler },
    { etiket: "Muhasebe (Vergi, SGK)", tutar: muhasebeGideri },
    { etiket: "Diğer Giderler", tutar: digerGiderler },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gider Kalemleri</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col text-sm">
        {kalemler.map((kalem) => (
          <div
            key={kalem.etiket}
            className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0"
          >
            <dt className="text-muted-foreground">{kalem.etiket}</dt>
            <dd>{paraFormat(kalem.tutar)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between pt-3 font-semibold">
          <dt>Toplam Gider</dt>
          <dd className="text-rose-600 dark:text-rose-400">{paraFormat(toplamGider)}</dd>
        </div>

        {sabitPersonel.terapistPrimleri.length > 0 && (
          <details className="mt-3 text-xs text-muted-foreground print:hidden">
            <summary className="cursor-pointer select-none text-foreground">
              Terapist prim dökümü ({sabitPersonel.terapistPrimleri.length})
            </summary>
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {sabitPersonel.terapistPrimleri.map((satir) => (
                <li key={satir.personelId} className="flex flex-col gap-0.5 py-2">
                  <div className="flex items-center justify-between text-foreground">
                    <span className="font-medium">{satir.adSoyad}</span>
                    <span>{paraFormat(satir.toplam)}</span>
                  </div>
                  <span>{satir.aciklama}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function NetKarZararKarti({ gelir, gider }: { gelir: number; gider: number }) {
  const netKar = gelir - gider;
  const marj = gelir > 0 ? (netKar / gelir) * 100 : 0;
  const pozitif = netKar >= 0;

  return (
    <Card className={pozitif ? undefined : "border-rose-500/30"}>
      <CardHeader>
        <CardTitle>Net Kâr / Zarar</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            className={cn(
              "text-2xl font-semibold",
              pozitif ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}
          >
            {paraFormat(netKar)}
          </p>
          <p className="text-xs text-muted-foreground">Kâr marjı: %{marj.toFixed(0)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground">
          <span>
            Gelir: <span className="font-medium text-emerald-600 dark:text-emerald-400">{paraFormat(gelir)}</span>
          </span>
          <span>
            Gider: <span className="font-medium text-rose-600 dark:text-rose-400">{paraFormat(gider)}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

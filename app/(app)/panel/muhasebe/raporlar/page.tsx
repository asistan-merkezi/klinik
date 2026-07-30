import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { raporAyDonemi, raporYilDonemi } from "@/lib/raporlar/donem";
import {
  hesaplaFaturaliGiderler,
  hesaplaGelir,
  hesaplaIsletmeGideri,
  hesaplaMuhasebeGideri,
  hesaplaSabitPersonelMaliyeti,
  hesaplaYillikOzet,
} from "@/lib/raporlar/hesaplamalar";
import { YillikGrafik } from "@/components/raporlar/yillik-grafik";

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
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">Raporlar</h1>
            <p className="text-sm text-muted-foreground">
              Sabit personel, işletme/faturalı giderler, muhasebe (vergi/SGK) ve gelir özetleri.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
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

  const [sabitPersonel, isletmeGideri, faturaliGiderler, muhasebeGideri, gelir] = await Promise.all([
    hesaplaSabitPersonelMaliyeti(supabase, klinikId, donem),
    hesaplaIsletmeGideri(supabase, klinikId, donem),
    hesaplaFaturaliGiderler(supabase, klinikId, donem),
    hesaplaMuhasebeGideri(supabase, klinikId, donem),
    hesaplaGelir(supabase, klinikId, donem),
  ]);

  const toplamGider = isletmeGideri + faturaliGiderler + muhasebeGideri + sabitPersonel.toplamMaas;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Gelir</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">KDV&apos;li (brüt)</dt>
            <dd className="font-semibold">{paraFormat(gelir.kdvli)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">KDV&apos;siz (net)</dt>
            <dd>{paraFormat(gelir.kdvsiz)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">KDV tutarı</dt>
            <dd>{paraFormat(gelir.kdvTutari)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2">
            <dt className="text-muted-foreground">İskonto</dt>
            <dd>-{paraFormat(gelir.iskontoToplam)}</dd>
          </div>
          <div className="flex items-center justify-between font-semibold">
            <dt>Net tahsilat</dt>
            <dd>{paraFormat(gelir.netTahsilat)}</dd>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sabit Personel</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between font-semibold">
            <dt>Toplam</dt>
            <dd>{paraFormat(sabitPersonel.toplamMaas)}</dd>
          </div>
          {sabitPersonel.terapistPrimleri.length > 0 && (
            <details className="text-xs text-muted-foreground">
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

      <Card>
        <CardHeader>
          <CardTitle>İşletme Gideri</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold">{paraFormat(isletmeGideri)}</p>
          <p className="text-xs text-muted-foreground">Kira, fatura, malzeme — faturasız kayıtlar.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Faturalı Giderler</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold">{paraFormat(faturaliGiderler)}</p>
          <p className="text-xs text-muted-foreground">
            Aynı gider kategorileri, faturalı işaretlenmiş kayıtlar.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Muhasebe (Vergi, SGK)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold">{paraFormat(muhasebeGideri)}</p>
          <p className="text-xs text-muted-foreground">Vergi ve SGK ödemeleri (personel SGK payı dahil).</p>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle>Toplam Gider</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold">{paraFormat(toplamGider)}</p>
          <p className="text-xs text-muted-foreground">Sabit personel + işletme + faturalı + muhasebe.</p>
        </CardContent>
      </Card>
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
  const aylar = await hesaplaYillikOzet(supabase, klinikId, yil);
  const donem = raporYilDonemi(yil);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{donem.etiket} — Gelir/Gider</CardTitle>
      </CardHeader>
      <CardContent>
        <YillikGrafik aylar={aylar} />
      </CardContent>
    </Card>
  );
}

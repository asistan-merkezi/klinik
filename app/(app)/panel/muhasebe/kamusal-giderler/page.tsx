import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ayAraligi } from "@/lib/utils";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { kamusalOdemeDurumHesapla, type KamusalOdemeSatir } from "@/types/kamusal-odeme";
import type { KlinikArac } from "@/types/klinik";
import { YeniOdemeButonu } from "./yeni-odeme-butonu";
import { OdemeTablosu } from "./odeme-tablosu";

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

function OzetKarti({
  baslik,
  odenen,
  bekleyen,
}: {
  baslik: string;
  odenen: number;
  bekleyen: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{baslik} — Ödenen</p>
          <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{paraFormat(odenen)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{baslik} — Bekleyen</p>
          <p className="text-xl font-semibold text-amber-600 dark:text-amber-400">{paraFormat(bekleyen)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{baslik} — Toplam</p>
          <p className="text-xl font-semibold">{paraFormat(odenen + bekleyen)}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function KamusalGiderlerSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string }>;
}) {
  const { ay: ayParam } = await searchParams;
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

  const yonetici = kullanici?.rol === "klinik_admin";
  const klinikId = kullanici?.klinik_id ?? "";
  const ay = ayAraligi(ayParam);
  const [donemYil, donemAy] = ay.param.split("-").map(Number);

  const [ayKayitlariSonuc, yilKayitlariSonuc, araclarSonuc] = await Promise.all([
    supabase
      .from("kamusal_odeme")
      .select("id, odeme_tipi, tutar, donem_ay, donem_yil, vade_tarihi, odeme_tarihi, notlar, arac_id")
      .eq("klinik_id", klinikId)
      .eq("donem_yil", donemYil)
      .eq("donem_ay", donemAy)
      .order("vade_tarihi", { ascending: true })
      .returns<KamusalOdemeSatir[]>(),
    supabase
      .from("kamusal_odeme")
      .select("tutar, odeme_tarihi")
      .eq("klinik_id", klinikId)
      .eq("donem_yil", donemYil)
      .returns<{ tutar: number; odeme_tarihi: string | null }[]>(),
    supabase
      .from("klinik_arac")
      .select("id, marka, model, plaka")
      .eq("klinik_id", klinikId)
      .order("plaka")
      .returns<KlinikArac[]>(),
  ]);

  const araclar = araclarSonuc.data ?? [];

  const bugun = bugunIstanbulTarihi();
  const ayKayitlari = (ayKayitlariSonuc.data ?? []).map((satir) => ({
    ...satir,
    durum: kamusalOdemeDurumHesapla(satir, bugun),
  }));

  const ayOdenen = ayKayitlari.filter((s) => s.durum === "odendi").reduce((acc, s) => acc + s.tutar, 0);
  const ayBekleyen = ayKayitlari.filter((s) => s.durum !== "odendi").reduce((acc, s) => acc + s.tutar, 0);

  const yilKayitlari = yilKayitlariSonuc.data ?? [];
  const yilOdenen = yilKayitlari.filter((s) => s.odeme_tarihi).reduce((acc, s) => acc + s.tutar, 0);
  const yilBekleyen = yilKayitlari.filter((s) => !s.odeme_tarihi).reduce((acc, s) => acc + s.tutar, 0);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Kamusal Giderler</h1>
            <p className="text-sm text-muted-foreground">
              Vergi, SGK ve diğer resmi kesinti/ödeme takibi.
            </p>
          </div>
          {yonetici && (
            <YeniOdemeButonu varsayilanDonemAy={donemAy} varsayilanDonemYil={donemYil} araclar={araclar} />
          )}
        </header>

        <OzetKarti baslik={`${donemYil} Yılı`} odenen={yilOdenen} bekleyen={yilBekleyen} />

        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">{ay.etiket}</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/muhasebe/kamusal-giderler?ay=${ay.oncekiParam}`}>‹ Önceki</Link>}
            />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/muhasebe/kamusal-giderler?ay=${ay.sonrakiParam}`}>Sonraki ›</Link>}
            />
          </div>
        </div>

        <OzetKarti baslik={ay.etiket} odenen={ayOdenen} bekleyen={ayBekleyen} />

        {ayKayitlari.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu ay için kayıtlı kamusal ödeme yok.</p>
        ) : (
          <OdemeTablosu satirlar={ayKayitlari} yonetici={yonetici} araclar={araclar} />
        )}
      </div>
    </div>
  );
}

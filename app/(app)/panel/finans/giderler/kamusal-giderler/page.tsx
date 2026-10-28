import Link from "next/link";
import { Landmark } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tl, tlTopla } from "@/lib/para";
import { araclariGetir, bankaHesaplariniGetir } from "@/lib/finans/okuma";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ayAraligi } from "@/lib/utils";
import { bugunIstanbulTarihi } from "@/lib/datetime";
import { kamusalOdemeDurumHesapla, type KamusalOdemeSatir } from "@/types/kamusal-odeme";
import { YeniOdemeButonu } from "./yeni-odeme-butonu";
import { OdemeTablosu } from "./odeme-tablosu";
import { GiderlerSekmeCubugu } from "../giderler-sekme-cubugu";

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
          <p className="text-xl font-semibold">{paraFormat(tlTopla([odenen, bekleyen]))}</p>
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
  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansYonetim);
  const { bag } = await panelBaglami();

  const yonetici = kullanici.rol === "klinik_admin";
  const ay = ayAraligi(ayParam);
  const [donemYil, donemAy] = ay.param.split("-").map(Number);

  const v = await withTenant(bag, async (tx) => {
    const K = sema.kamusalOdeme;
    const ayKayitlari = await tx
      .select({
        id: K.id,
        odeme_tipi: K.odemeTipi,
        tutar: K.tutar,
        donem_ay: K.donemAy,
        donem_yil: K.donemYil,
        vade_tarihi: K.vadeTarihi,
        odeme_tarihi: K.odemeTarihi,
        notlar: K.notlar,
        arac_id: K.aracId,
        odeme_yontemi: K.odemeYontemi,
        banka_hesap_id: K.bankaHesapId,
      })
      .from(K)
      .where(and(eq(K.donemYil, donemYil), eq(K.donemAy, donemAy)))
      .orderBy(asc(K.vadeTarihi), asc(K.id));
    const yilKayitlari = await tx.select({ tutar: K.tutar, odeme_tarihi: K.odemeTarihi }).from(K).where(eq(K.donemYil, donemYil));
    return {
      ayKayitlari: ayKayitlari.map((r) => ({ ...r, tutar: tl(r.tutar) })) as KamusalOdemeSatir[],
      yilKayitlari: yilKayitlari.map((r) => ({ tutar: tl(r.tutar), odeme_tarihi: r.odeme_tarihi })),
      araclar: await araclariGetir(tx),
      bankaHesaplari: await bankaHesaplariniGetir(tx),
    };
  });

  const { araclar, bankaHesaplari } = v;

  const bugun = bugunIstanbulTarihi();
  const ayKayitlari = v.ayKayitlari.map((satir) => ({
    ...satir,
    durum: kamusalOdemeDurumHesapla(satir, bugun),
  }));

  const ayOdenen = tlTopla(ayKayitlari.filter((s) => s.durum === "odendi").map((s) => s.tutar));
  const ayBekleyen = tlTopla(ayKayitlari.filter((s) => s.durum !== "odendi").map((s) => s.tutar));

  const yilKayitlari = v.yilKayitlari;
  const yilOdenen = tlTopla(yilKayitlari.filter((s) => s.odeme_tarihi).map((s) => s.tutar));
  const yilBekleyen = tlTopla(yilKayitlari.filter((s) => !s.odeme_tarihi).map((s) => s.tutar));

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          title="Kamusal Giderler"
          description="Vergi, SGK ve diğer resmi kesinti/ödeme takibi."
          icon={Landmark}
          actions={
            yonetici && (
              <YeniOdemeButonu
                varsayilanDonemAy={donemAy}
                varsayilanDonemYil={donemYil}
                araclar={araclar}
                bankaHesaplari={bankaHesaplari}
              />
            )
          }
        />

        <GiderlerSekmeCubugu />

        <OzetKarti baslik={`${donemYil} Yılı`} odenen={yilOdenen} bekleyen={yilBekleyen} />

        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">{ay.etiket}</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/finans/giderler/kamusal-giderler?ay=${ay.oncekiParam}`}>‹ Önceki</Link>}
            />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/panel/finans/giderler/kamusal-giderler?ay=${ay.sonrakiParam}`}>Sonraki ›</Link>}
            />
          </div>
        </div>

        <OzetKarti baslik={ay.etiket} odenen={ayOdenen} bekleyen={ayBekleyen} />

        {ayKayitlari.length === 0 ? (
          <EmptyState icon={Landmark} title="Bu ay için kayıtlı kamusal ödeme yok." compact />
        ) : (
          <OdemeTablosu satirlar={ayKayitlari} yonetici={yonetici} araclar={araclar} bankaHesaplari={bankaHesaplari} />
        )}
      </div>
    </div>
  );
}

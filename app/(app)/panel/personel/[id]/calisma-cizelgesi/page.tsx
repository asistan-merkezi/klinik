import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ayAraligi } from "@/lib/utils";
import { ayGunSatirlariOlustur, yillikAySatirlariOlustur } from "@/lib/puantaj";
import type {
  PersonelPuantajDonem,
  PersonelPuantajSatir,
  PersonelVardiyaAtamaSatir,
} from "@/types/puantaj";
import { AylikTablo } from "./aylik-tablo";
import { YillikTablo } from "./yillik-tablo";

const PUANTAJ_SATIR_KOLONLARI =
  "id, tarih, planlanan_baslangic, planlanan_bitis, giris_saat, cikis_saat, mola_dakika, net_calisma_dakika, sapma_dakika, fazla_mesai_dakika, eksik_calisma_dakika, fm_onay_durumu, durum, kaynak, not_metni";

export default async function CalismaCizelgesiSayfasi({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gorunum?: string; ay?: string; yil?: string }>;
}) {
  const { id } = await params;
  const { gorunum: gorunumParam, ay: ayParam, yil: yilParam } = await searchParams;
  const gorunum: "aylik" | "yillik" = gorunumParam === "yillik" ? "yillik" : "aylik";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();
  const { data: personel } = await supabase
    .from("personel")
    .select("id, ad_soyad, kullanici_id")
    .eq("id", id)
    .single();

  if (!personel) {
    notFound();
  }

  const yonetici = kullanici?.rol === "klinik_admin";
  const kendisi = personel.kullanici_id === user.id;

  if (!yonetici && !kendisi) {
    notFound();
  }

  const gorunumHref = (g: "aylik" | "yillik") => `/panel/personel/${id}/calisma-cizelgesi?gorunum=${g}`;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/panel/personel/${id}`}>‹ {personel.ad_soyad}</Link>}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Çalışma Çizelgesi</h1>
          <div className="flex gap-2">
            <Button
              variant={gorunum === "aylik" ? "default" : "outline"}
              size="sm"
              nativeButton={false}
              render={<Link href={gorunumHref("aylik")}>Aylık</Link>}
            />
            <Button
              variant={gorunum === "yillik" ? "default" : "outline"}
              size="sm"
              nativeButton={false}
              render={<Link href={gorunumHref("yillik")}>Yıllık</Link>}
            />
          </div>
        </div>

        {gorunum === "yillik" ? (
          <YillikGorunum personelId={id} yilParam={yilParam} />
        ) : (
          <AylikGorunum personelId={id} ayParam={ayParam} yonetici={yonetici} />
        )}
      </div>
    </div>
  );
}

async function AylikGorunum({
  personelId,
  ayParam,
  yonetici,
}: {
  personelId: string;
  ayParam?: string;
  yonetici: boolean;
}) {
  const supabase = await createClient();
  const ay = ayAraligi(ayParam);
  const [yilStr, ayStr] = ay.param.split("-");
  const yil = Number(yilStr);
  const ayNum = Number(ayStr);

  const [puantajSonucu, atamaSonucu, donemSonucu] = await Promise.all([
    supabase
      .from("personel_puantaj")
      .select(PUANTAJ_SATIR_KOLONLARI)
      .eq("personel_id", personelId)
      .gte("tarih", ay.baslangicTarih)
      .lt("tarih", ay.bitisTarih)
      .returns<PersonelPuantajSatir[]>(),
    supabase
      .from("personel_vardiya_atama")
      .select("id, haftanin_gunu, gecerlilik_baslangic, gecerlilik_bitis, vardiya_turu:vardiya_turu_id(id, ad, baslangic_saat, bitis_saat, aktif)")
      .eq("personel_id", personelId)
      .returns<PersonelVardiyaAtamaSatir[]>(),
    supabase
      .from("personel_puantaj_donem")
      .select(
        "id, yil, ay, durum, snapshot_net_saat, snapshot_onayli_fm_saat, snapshot_eksik_saat, snapshot_izin_gun, snapshot_devamsizlik_gun, kapatan_id, kapatma_tarihi"
      )
      .eq("personel_id", personelId)
      .eq("yil", yil)
      .eq("ay", ayNum)
      .maybeSingle<PersonelPuantajDonem>(),
  ]);

  const gunler = ayGunSatirlariOlustur(yil, ayNum, puantajSonucu.data ?? [], atamaSonucu.data ?? []);
  const gorunumBase = `/panel/personel/${personelId}/calisma-cizelgesi?gorunum=aylik`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`${gorunumBase}&ay=${ay.oncekiParam}`}>‹</Link>}
        />
        <span className="text-sm font-medium capitalize">{ay.etiket}</span>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`${gorunumBase}&ay=${ay.sonrakiParam}`}>›</Link>}
        />
      </div>

      <AylikTablo
        personelId={personelId}
        yil={yil}
        ay={ayNum}
        ayEtiket={ay.etiket}
        gunler={gunler}
        donem={donemSonucu.data}
        yonetici={yonetici}
      />
    </div>
  );
}

async function YillikGorunum({ personelId, yilParam }: { personelId: string; yilParam?: string }) {
  const supabase = await createClient();
  const yilVarsayilan = Number(ayAraligi().param.split("-")[0]);
  const yil = yilParam && /^\d{4}$/.test(yilParam) ? Number(yilParam) : yilVarsayilan;

  const [donemSonucu, puantajSonucu] = await Promise.all([
    supabase.from("personel_puantaj_donem").select("ay, durum").eq("personel_id", personelId).eq("yil", yil),
    supabase
      .from("personel_puantaj")
      .select("tarih, net_calisma_dakika, fazla_mesai_dakika, fm_onay_durumu, eksik_calisma_dakika, durum")
      .eq("personel_id", personelId)
      .gte("tarih", `${yil}-01-01`)
      .lt("tarih", `${yil + 1}-01-01`),
  ]);

  const aylar = yillikAySatirlariOlustur(puantajSonucu.data ?? [], donemSonucu.data ?? []);
  const gorunumBase = `/panel/personel/${personelId}/calisma-cizelgesi?gorunum=yillik`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${gorunumBase}&yil=${yil - 1}`}>‹</Link>} />
        <span className="text-sm font-medium">{yil}</span>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${gorunumBase}&yil=${yil + 1}`}>›</Link>} />
      </div>

      <YillikTablo personelId={personelId} yil={yil} aylar={aylar} />
    </div>
  );
}

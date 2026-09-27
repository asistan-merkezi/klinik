import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { bugunIstanbulTarihi, formatDateForInput } from "@/lib/datetime";
import { raporAyDonemi, raporGunDonemi, raporYilDonemi, type RaporDonemi } from "@/lib/raporlar/donem";
import type { FaturaSatir } from "@/types/odeme";
import type { FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
import { FinansBorcSatiriBileseni, type FinansBorcSatiri } from "./borc-satiri";

type BorcSorguSatiri = {
  id: string;
  hasta_id: string;
  tutar: number;
  iskonto_tutari: number;
  aciklama: string | null;
  created_at: string;
  hasta: { ad_soyad: string; eposta: string | null } | null;
  randevu: {
    terapist: { personel: { ad_soyad: string } | null } | null;
    islem_tanimi: { ad: string } | null;
  } | null;
  odeme: { fatura: FaturaSatir[] } | null;
};

type HastaHassasSatiri = { hasta_id: string; kimlik_no: string | null; adres: string | null };

/** Saf "YYYY-MM-DD" takvim tarihine gün ekler — raporlar/page.tsx'teki aynı yardımcının birebir aynısı. */
function gunEkle(tarih: string, delta: number): string {
  const [yil, ay, gun] = tarih.split("-").map(Number);
  const tarihNesnesi = new Date(yil, ay - 1, gun);
  tarihNesnesi.setDate(tarihNesnesi.getDate() + delta);
  const yeniYil = tarihNesnesi.getFullYear();
  const yeniAy = String(tarihNesnesi.getMonth() + 1).padStart(2, "0");
  const yeniGun = String(tarihNesnesi.getDate()).padStart(2, "0");
  return `${yeniYil}-${yeniAy}-${yeniGun}`;
}

export default async function FaturalarSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ gorunum?: string; yil?: string; ay?: string; tarih?: string }>;
}) {
  const { gorunum: gorunumParam, yil: yilParam, ay: ayParam, tarih: tarihParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  const yetkili =
    kullanici?.rol === "klinik_admin" ||
    kullanici?.rol === "resepsiyon" ||
    kullanici?.rol === "muhasebe" ||
    kullanici?.rol === "super_admin";

  if (!yetkili) {
    redirect("/panel");
  }

  // Fatura kesme yetkisi RPC'de de ayrıca zorlanıyor (bkz. migration
  // 20260927160000) — burası sadece dialogu göstermeye karar veriyor.
  const duzenlenebilir =
    kullanici?.rol === "klinik_admin" || kullanici?.rol === "resepsiyon" || kullanici?.rol === "muhasebe";

  const { data: klinik } = await supabase
    .from("klinik")
    .select("created_at")
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle<{ created_at: string }>();

  const simdi = new Date();
  const buYil = simdi.getFullYear();
  const buAy = simdi.getMonth() + 1;
  const klinikBaslangicYili = klinik?.created_at ? new Date(klinik.created_at).getFullYear() : buYil;
  const bugunTarih = bugunIstanbulTarihi();
  const klinikBaslangicTarihi = klinik?.created_at ? formatDateForInput(klinik.created_at) : bugunTarih;

  const gorunum =
    gorunumParam === "yillik"
      ? "yillik"
      : gorunumParam === "aylik"
        ? "aylik"
        : gorunumParam === "gunluk"
          ? "gunluk"
          : "tumu";
  const yil = Math.min(Math.max(parseInt(yilParam ?? "", 10) || buYil, klinikBaslangicYili), buYil);
  const ay = Math.min(Math.max(parseInt(ayParam ?? "", 10) || buAy, 1), 12);
  const tarihGecerliMi = !!tarihParam && /^\d{4}-\d{2}-\d{2}$/.test(tarihParam);
  const tarih = tarihGecerliMi
    ? tarihParam < klinikBaslangicTarihi
      ? klinikBaslangicTarihi
      : tarihParam > bugunTarih
        ? bugunTarih
        : tarihParam
    : bugunTarih;

  const oncekiAyTarih = new Date(Date.UTC(yil, ay - 2, 1));
  const sonrakiAyTarih = new Date(Date.UTC(yil, ay, 1));
  const oncekiAyGosterilebilir =
    oncekiAyTarih.getUTCFullYear() > klinikBaslangicYili || oncekiAyTarih.getUTCFullYear() === klinikBaslangicYili;
  const sonrakiAyGosterilebilir =
    sonrakiAyTarih.getUTCFullYear() < buYil ||
    (sonrakiAyTarih.getUTCFullYear() === buYil && sonrakiAyTarih.getUTCMonth() + 1 <= buAy);

  const oncekiGunTarih = gunEkle(tarih, -1);
  const sonrakiGunTarih = gunEkle(tarih, 1);
  const oncekiGunGosterilebilir = tarih > klinikBaslangicTarihi;
  const sonrakiGunGosterilebilir = tarih < bugunTarih;

  const donem: RaporDonemi | null =
    gorunum === "yillik"
      ? raporYilDonemi(yil)
      : gorunum === "aylik"
        ? raporAyDonemi(yil, ay)
        : gorunum === "gunluk"
          ? raporGunDonemi(tarih)
          : null;

  let sorgu = supabase
    .from("hasta_bakiye_hareket")
    .select(
      "id, hasta_id, tutar, iskonto_tutari, aciklama, created_at, " +
        "hasta(ad_soyad, eposta), " +
        "randevu(terapist(personel(ad_soyad)), islem_tanimi(ad)), " +
        "odeme(fatura(id, durum, hata_mesaji, e_arsiv_pdf_url))"
    )
    .eq("tur", "borc")
    .order("created_at", { ascending: false });

  sorgu = donem ? sorgu.gte("created_at", donem.baslangic).lt("created_at", donem.bitis) : sorgu.limit(200);

  const { data } = await sorgu.returns<BorcSorguSatiri[]>();

  const borclar = data ?? [];
  const hastaIdler = [...new Set(borclar.map((b) => b.hasta_id))];

  const { data: hassasData } = hastaIdler.length
    ? await supabase
        .from("hasta_hassas")
        .select("hasta_id, kimlik_no, adres")
        .in("hasta_id", hastaIdler)
        .returns<HastaHassasSatiri[]>()
    : { data: [] as HastaHassasSatiri[] };

  const hassasMap = new Map((hassasData ?? []).map((h) => [h.hasta_id, h]));

  const satirlar: FinansBorcSatiri[] = borclar.map((b) => {
    const hassas = hassasMap.get(b.hasta_id);
    const faturaBilgisi: FaturaBilgisiKontrol = {
      adSoyad: b.hasta?.ad_soyad ?? null,
      eposta: b.hasta?.eposta ?? null,
      adres: hassas?.adres ?? null,
      kimlikNo: hassas?.kimlik_no ?? null,
    };
    return {
      id: b.id,
      hastaAdSoyad: b.hasta?.ad_soyad ?? "—",
      islemAdi: b.randevu?.islem_tanimi?.ad ?? b.aciklama ?? "Borç",
      terapistAdi: b.randevu?.terapist?.personel?.ad_soyad ?? null,
      tutar: b.tutar,
      iskontoTutari: b.iskonto_tutari,
      createdAt: b.created_at,
      fatura: b.odeme?.fatura?.[0] ?? null,
      faturaBilgisi,
    };
  });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <PageHeader
          title="Kesilen Faturalar"
          description="Tüm seans ve paket bedelleri burada listelenir. Fatura kesmek istediğiniz satıra tıklayın; dokunmadığınız satırlar faturasız kayıt olarak kalır."
          icon={Receipt}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-muted/60 p-1 text-sm">
            <Link
              href="?gorunum=tumu"
              className={cn(
                "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                gorunum === "tumu" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Tümü
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
            <Link
              href={`?gorunum=aylik&yil=${yil}&ay=${ay}`}
              className={cn(
                "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                gorunum === "aylik" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Aylık
            </Link>
            <Link
              href={`?gorunum=gunluk&tarih=${tarih}`}
              className={cn(
                "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                gorunum === "gunluk"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Günlük
            </Link>
          </div>

          {gorunum === "yillik" ? (
            <div className="flex items-center gap-2 text-sm">
              {yil > klinikBaslangicYili ? (
                <Link className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60" href={`?gorunum=yillik&yil=${yil - 1}`}>
                  ‹ {yil - 1}
                </Link>
              ) : (
                <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">‹ {yil - 1}</span>
              )}
              <span className="min-w-16 text-center font-medium">{yil}</span>
              {yil < buYil ? (
                <Link className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60" href={`?gorunum=yillik&yil=${yil + 1}`}>
                  {yil + 1} ›
                </Link>
              ) : (
                <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">{yil + 1} ›</span>
              )}
            </div>
          ) : gorunum === "aylik" ? (
            <div className="flex items-center gap-2 text-sm">
              {oncekiAyGosterilebilir ? (
                <Link
                  className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60"
                  href={`?gorunum=aylik&yil=${oncekiAyTarih.getUTCFullYear()}&ay=${oncekiAyTarih.getUTCMonth() + 1}`}
                >
                  ‹ Önceki
                </Link>
              ) : (
                <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">‹ Önceki</span>
              )}
              <span className="min-w-32 text-center font-medium">{raporAyDonemi(yil, ay).etiket}</span>
              {sonrakiAyGosterilebilir ? (
                <Link
                  className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60"
                  href={`?gorunum=aylik&yil=${sonrakiAyTarih.getUTCFullYear()}&ay=${sonrakiAyTarih.getUTCMonth() + 1}`}
                >
                  Sonraki ›
                </Link>
              ) : (
                <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">Sonraki ›</span>
              )}
            </div>
          ) : gorunum === "gunluk" ? (
            <div className="flex items-center gap-2 text-sm">
              {oncekiGunGosterilebilir ? (
                <Link className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60" href={`?gorunum=gunluk&tarih=${oncekiGunTarih}`}>
                  ‹ Önceki
                </Link>
              ) : (
                <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">‹ Önceki</span>
              )}
              <span className="min-w-48 text-center font-medium">{raporGunDonemi(tarih).etiket}</span>
              {sonrakiGunGosterilebilir ? (
                <Link className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted/60" href={`?gorunum=gunluk&tarih=${sonrakiGunTarih}`}>
                  Sonraki ›
                </Link>
              ) : (
                <span className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground opacity-50">Sonraki ›</span>
              )}
            </div>
          ) : null}
        </div>

        {satirlar.length === 0 ? (
          <EmptyState icon={Receipt} title="Bu dönemde borç kaydı yok." />
        ) : (
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tarih</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead>İşlem</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead className="text-right">İskonto</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {satirlar.map((satir) => (
                <FinansBorcSatiriBileseni key={satir.id} satir={satir} duzenlenebilir={duzenlenebilir} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

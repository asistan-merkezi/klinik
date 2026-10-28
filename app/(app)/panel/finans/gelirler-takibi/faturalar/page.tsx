import Link from "next/link";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { borcSatirlariniGetir } from "@/lib/fatura/sorgular";
import { netTutar, kurus } from "@/lib/para";
import { ROL_GRUPLARI, sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { bugunIstanbulTarihi, formatDateForInput } from "@/lib/datetime";
import { raporAyDonemi, raporGunDonemi, raporYilDonemi, type RaporDonemi } from "@/lib/raporlar/donem";
import type { FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
import { kdvAyristir } from "@/lib/fatura/kdv-hesapla";
import { FinansBorcSatiriBileseni, type FinansBorcSatiri } from "./borc-satiri";

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
  const { kullanici } = await sayfaYetkisiIste(ROL_GRUPLARI.finansFatura);
  const { bag } = await panelBaglami();

  // Fatura kesme yetkisi RPC'de de ayrıca zorlanıyor (bkz. migration
  // 20260927160000) — burası sadece dialogu göstermeye karar veriyor.
  // (super_admin sayfaya girer ama fatura kesme butonu görmez — eski davranış.)
  const duzenlenebilir = (ROL_GRUPLARI.finansFatura as readonly string[]).includes(kullanici.rol);

  const klinik = await withTenant(bag, async (tx) => (await tx.select({ created_at: sema.klinik.createdAt }).from(sema.klinik).where(eq(sema.klinik.id, bag.tenantId)).limit(1))[0]);

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

  // Dönem seçiliyse dönemin TÜM satırları; "Tümü"nde son 200 kayıt (Drizzle'da PostgREST'in 1000 satır sınırı yoktur).
  const borclar = await withTenant(bag, (tx) =>
    donem ? borcSatirlariniGetir(tx, { baslangic: donem.baslangic, bitis: donem.bitis }) : borcSatirlariniGetir(tx, { limit: 200 })
  );

  const satirlar: FinansBorcSatiri[] = borclar.map((b) => {
    const hassas = b.hassas;
    const faturaBilgisi: FaturaBilgisiKontrol = {
      adSoyad: b.hasta?.ad_soyad ?? null,
      eposta: b.hasta?.eposta ?? null,
      adres: hassas?.adres ?? null,
      kimlikNo: hassas?.kimlik_no ?? null,
    };
    // Toplam Tutar = hastadan bu satır için fiilen tahsil edilen (iskonto
    // sonrası, KDV dahil) net tutar — bkz. hasta_bakiye_hareket_borc_duzenle
    // RPC'sindeki v_net_toplam. Tutar/KDV bundan geriye doğru ayrıştırılır
    // (kdvAyristir), tedavinin islem_tanimi.kdv_orani'na göre; randevusuz
    // (ör. paket) borçlarda oran bilinmediği için 0 kabul edilir.
    const toplamTutar = netTutar(kurus(b.tutar) ?? 0, kurus(b.iskonto_tutari) ?? 0) / 100;
    const kdvOrani = b.islem?.kdv_orani ?? 0;
    const { matrah, kdvTutari } = kdvAyristir(toplamTutar, kdvOrani);
    return {
      id: b.id,
      hastaAdSoyad: b.hasta?.ad_soyad ?? "—",
      islemAdi:
        b.islem?.muhasebe_hizmet_ismi ?? b.islem?.ad ?? b.aciklama ?? "Borç",
      tutar: b.tutar,
      iskontoTutari: b.iskonto_tutari,
      matrah,
      kdvTutari,
      toplamTutar,
      createdAt: b.created_at,
      fatura: b.fatura,
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
                <TableHead>Saat</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead>Açıklama</TableHead>
                <TableHead className="text-right">Tutar</TableHead>
                <TableHead className="text-right">KDV</TableHead>
                <TableHead className="text-right">Toplam Tutar</TableHead>
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

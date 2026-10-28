import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Briefcase } from "lucide-react";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { acikBasvurulariGetir, pozisyonlariGetir } from "@/lib/personel/sorgular";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { QrKart } from "@/components/panel/qr-kart";
import { IsBasvuruFormuPdfButonu } from "@/components/panel/is-basvuru-formu-pdf-butonu";
import { BasvuruListesi } from "./basvuru-listesi";
import { BasvuruArsivi } from "./basvuru-arsivi";

export default async function BasvurularSayfasi() {
  const { ctx, bag } = await panelBaglami();
  if (ctx.rol !== "klinik_admin") {
    redirect("/panel/personel");
  }

  let kisaKod: string | null | undefined;
  let liste: Awaited<ReturnType<typeof acikBasvurulariGetir>> = [];
  let pozisyonlar: Awaited<ReturnType<typeof pozisyonlariGetir>> = [];
  let error = false;
  try {
    // "Olumlu / Onayla" ile açılan Personel Ekle formunun Pozisyon seçimi için yalnız aktif pozisyonlar (Ayarlar → Personel Tanımlama).
    const v = await withTenant(bag, async (tx) => ({
      kisaKod: (await tx.select({ k: sema.klinik.qrKisaKod }).from(sema.klinik).where(eq(sema.klinik.id, bag.tenantId)).limit(1))[0]?.k,
      liste: await acikBasvurulariGetir(tx, bag.tenantId),
      pozisyonlar: await pozisyonlariGetir(tx, true),
    }));
    ({ kisaKod, liste, pozisyonlar } = v);
  } catch (e) {
    console.error("Başvurular çekilemedi:", e);
    error = true;
  }

  const bekleyenler = liste.filter((b) => b.durum === "beklemede");

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-24 sm:p-8">
        <div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/panel/personel"><ArrowLeft /> Personel Listesi</Link>} />
        </div>

        <PageHeader
          title="İş Başvurusu"
          icon={Briefcase}
          description="Gelen başvuruları değerlendirin — Olumlu bulduğunuz bir başvuru, bilgileriyle önceden doldurulmuş Personel oluşturma formunu açar. Olumsuz/Beklemede kalanlar aşağıdaki arşivde ay/yıl bazlı saklanır, hiçbir bilgi silinmez."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col justify-center gap-3 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">Elle Doldurulacak Form</p>
            <p className="text-xs text-muted-foreground">
              Aday kliniğe geldiyse yazdırıp kağıt üzerinde doldurtabilirsiniz.
            </p>
            <IsBasvuruFormuPdfButonu />
          </div>
          {kisaKod && (
            <QrKart
              icon={<Briefcase className="size-5 text-primary" aria-hidden />}
              baslik="İş Başvurusu (Web)"
              aciklama="Aday kendi telefonundan/bilgisayarından doldurur — kayıt aşağıdaki listeye düşer."
              yol={`/basvuru/is/${kisaKod}`}
              dosyaAdi="is-basvuru-qr"
            />
          )}
        </div>

        {error && <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>}

        {!error && (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Bekleyen Başvurular ({bekleyenler.length})
              </h2>
              <BasvuruListesi basvurular={bekleyenler} pozisyonlar={pozisyonlar} />
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Arşiv</h2>
              <BasvuruArsivi basvurular={liste} pozisyonlar={pozisyonlar} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

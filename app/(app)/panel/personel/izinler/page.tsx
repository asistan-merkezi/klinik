import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarCheck2, FileHeart } from "lucide-react";
import { asc, desc, eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { izinTalepleriniYoneticiGetir } from "@/lib/personel/sorgular";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/datetime";
import { TalepSatiri } from "./talep-satiri";
import { ManuelIzinEkleDialog } from "./manuel-izin-ekle-dialog";
import { ManuelRaporEkleDialog } from "./manuel-rapor-ekle-dialog";

type RaporSatiri = {
  tarih: string;
  not_metni: string | null;
  personel: { ad_soyad: string; gorev: string } | null;
};

export default async function IzinlerSayfasi() {
  const { ctx, bag } = await panelBaglami();
  if (ctx.rol !== "klinik_admin") {
    notFound();
  }

  let liste: Awaited<ReturnType<typeof izinTalepleriniYoneticiGetir>> = [];
  let personelListesi: { id: string; ad_soyad: string; gorev: string }[] = [];
  let raporListesi: RaporSatiri[] = [];
  let error = false;
  try {
    const v = await withTenant(bag, async (tx) => ({
      talepler: await izinTalepleriniYoneticiGetir(tx),
      personel: await tx.select({ id: sema.personel.id, ad_soyad: sema.personel.adSoyad, gorev: sema.personel.gorev }).from(sema.personel).where(eq(sema.personel.aktif, true)).orderBy(asc(sema.personel.adSoyad)),
      raporlar: await tx
        .select({ tarih: sema.personelPuantaj.tarih, not_metni: sema.personelPuantaj.notMetni, ad: sema.personel.adSoyad, gorev: sema.personel.gorev })
        .from(sema.personelPuantaj)
        .leftJoin(sema.personel, eq(sema.personel.id, sema.personelPuantaj.personelId))
        .where(eq(sema.personelPuantaj.durum, "raporlu"))
        .orderBy(desc(sema.personelPuantaj.tarih))
        .limit(50),
    }));
    liste = v.talepler;
    personelListesi = v.personel as typeof personelListesi;
    raporListesi = v.raporlar.map((r) => ({ tarih: r.tarih, not_metni: r.not_metni, personel: r.ad === null ? null : { ad_soyad: r.ad, gorev: r.gorev as string } }));
  } catch (e) {
    console.error("İzin takibi çekilemedi:", e);
    error = true;
  }

  const bekleyenler = liste.filter((t) => t.durum === "beklemede");
  const sonuclananlar = liste.filter((t) => t.durum !== "beklemede");

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-24 sm:p-8">
        <div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/panel/personel"><ArrowLeft /> Personel</Link>} />
        </div>

        <PageHeader
          title="İzin / Rapor Takibi"
          description="Onay bekleyen izin talepleri + manuel izin/rapor girişi."
          icon={CalendarCheck2}
          actions={
            <>
              <ManuelIzinEkleDialog personelListesi={personelListesi} />
              <ManuelRaporEkleDialog personelListesi={personelListesi} />
            </>
          }
        />

        {error && <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Onay Bekleyenler {bekleyenler.length > 0 && `(${bekleyenler.length})`}
          </h2>
          {bekleyenler.length === 0 ? (
            <EmptyState icon={CalendarCheck2} title="Onay bekleyen talep yok." compact />
          ) : (
            <ul className="flex flex-col gap-2">
              {bekleyenler.map((talep) => (
                <TalepSatiri key={talep.id} talep={talep} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">İzin Geçmişi</h2>
          {sonuclananlar.length === 0 ? (
            <EmptyState icon={CalendarCheck2} title="Henüz sonuçlanmış talep yok." compact />
          ) : (
            <ul className="flex flex-col gap-2">
              {sonuclananlar.map((talep) => (
                <TalepSatiri key={talep.id} talep={talep} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Raporlu Günler</h2>
          {raporListesi.length === 0 ? (
            <EmptyState icon={FileHeart} title="Kayıtlı raporlu gün yok." compact />
          ) : (
            <ul className="flex flex-col gap-1.5 rounded-lg border border-border p-2 text-sm">
              {raporListesi.map((r, i) => (
                <li key={`${r.personel?.ad_soyad}-${r.tarih}-${i}`} className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{r.personel?.ad_soyad ?? "—"}</span>{" "}
                    <span className="text-muted-foreground">· {r.personel?.gorev}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(r.tarih)}
                    {r.not_metni && ` · ${r.not_metni}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

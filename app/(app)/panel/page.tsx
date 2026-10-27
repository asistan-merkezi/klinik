import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { tedaviSecenekleriGetir } from "@/lib/randevu/tedavi-secenekleri";
import {
  antrenorSecenekleriGetir,
  bankaHesaplariGetir,
  cihazSecenekleriGetir,
  kendiTerapistIdGetir,
  odaSecenekleriGetir,
  protokolSecenekleriGetir,
  randevuSatirlariGetir,
  tumTerapistSecenekleriGetir,
} from "@/lib/randevu/sorgular";
import { gunAraligi } from "@/lib/utils";
import { CanliCizelge } from "@/components/panel/canli-cizelge";
import { gorunumDurumuHesapla } from "@/components/panel/randevu-kutusu";
import { PageHeader } from "@/components/ui/page-header";
import { BugunkuSeanslarKarti } from "@/components/panel/bugunku-seanslar-karti";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { YeniRandevuDialog } from "@/app/(app)/panel/randevular/yeni-randevu-dialog";
import { YeniHastaDialog } from "@/app/(app)/panel/hastalar/yeni-hasta-dialog";

const KARSILAMA_TARIH_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function PanelSayfasi() {
  const { ctx, bag } = await panelBaglami();
  const rol = ctx.rol;
  const finansalGorunur = rol === "klinik_admin" || rol === "resepsiyon" || rol === "super_admin";
  const { baslangic, bitis } = gunAraligi();

  let veri = null;
  try {
    veri = await withTenant(bag, async (tx) => ({
      klinikAd: (await tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, bag.tenantId)).limit(1))[0]?.ad ?? null,
      kendiTerapistId: rol === "terapist" ? await kendiTerapistIdGetir(tx, ctx.userId) : null,
      randevular: await randevuSatirlariGetir(tx, { baslangic, bitis }),
      odalar: await odaSecenekleriGetir(tx),
      terapistler: await tumTerapistSecenekleriGetir(tx),
      cihazlar: await cihazSecenekleriGetir(tx),
      tedaviler: await tedaviSecenekleriGetir(tx),
      antrenorler: await antrenorSecenekleriGetir(tx),
      protokoller: await protokolSecenekleriGetir(tx),
      bankaHesaplari: finansalGorunur ? await bankaHesaplariGetir(tx) : [],
    }));
  } catch (hata) {
    console.error("Bugünkü randevular çekilemedi:", hata);
  }
  const error = veri === null;
  const klinik = { ad: veri?.klinikAd ?? null };
  const kendiTerapistId = veri?.kendiTerapistId ?? null;
  const randevular = veri?.randevular ?? [];
  const odalar = veri?.odalar ?? [];
  const terapistler = veri?.terapistler ?? [];
  const cihazlar = veri?.cihazlar ?? [];
  const tedaviler = veri?.tedaviler ?? [];
  const antrenorler = veri?.antrenorler ?? [];
  const protokoller = veri?.protokoller ?? [];
  const bankaHesaplari = veri?.bankaHesaplari ?? [];
  const kullanici = { ad_soyad: ctx.adSoyad };

  const bugunkuRandevuSayisi = randevular.length;

  // Terapist Durumları — bugünkü randevulardan (zaten sunucuda çekildi, ayrı
  // sorgu gerekmedi) o an "seansta" olan terapistler türetiliyor. CanliCizelge
  // gibi saniye saniye canlı DEĞİL, sayfa yüklendiği/gezinildiği andaki durumu
  // yansıtır — ayrı bir realtime abonelik açmamak için bilinçli bir basitleştirme.
  const simdi = new Date();
  const terapistDurumu = terapistler.map((t) => {
    const aktifRandevu = randevular.find(
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
          <BugunkuSeanslarKarti randevular={randevular} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {error ? (
              <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
            ) : (
              <CanliCizelge
                baslangicRandevular={randevular}
                odalar={odalar}
                terapistler={terapistler}
                cihazlar={cihazlar}
                tedaviler={tedaviler}
                antrenorler={antrenorler}
                protokoller={protokoller}
                bankaHesaplari={bankaHesaplari}
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
          </div>
        </div>

        {finansalGorunur && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Hızlı Resepsiyon İşlemleri
            </h2>
            <div className="flex flex-wrap gap-3">
              <YeniRandevuDialog
                kartGorunumu
                buttonLabel="Yeni Randevu"
                terapistler={terapistler}
                odalar={odalar}
                cihazlar={cihazlar}
                tedaviler={tedaviler}
              />
              <YeniHastaDialog kartGorunumu buttonLabel="Yeni Kayıt" />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

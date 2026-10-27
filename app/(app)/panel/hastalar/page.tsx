import Link from "next/link";
import { FileText, Users } from "lucide-react";
import { withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { hastaAra } from "@/lib/hasta/arama";
import { harfListesiGetir, harfSayilariGetir, listeEkVerisiGetir } from "@/lib/hasta/liste-sorgular";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { BildirimButonu } from "@/components/panel/bildirim-butonu";
import type { HastaListeSatiri } from "@/types/hasta";
import { YeniHastaDialog } from "./yeni-hasta-dialog";
import { HastaSatiri } from "./hasta-satiri";
import { HastaTablosu } from "./hasta-tablosu";
import { HastaAramaKutusu } from "./hasta-arama-kutusu";
import { bildirimSayisi } from "./bildirimler/bildirim-sayisi";
import {
  DIGER,
  SAYFA_BOYUTU,
  harfAnahtari,
  harfParametresiCoz,
  harfSayilariniTopla,
  sayfaParametresiCoz,
} from "@/lib/hasta/harf-listesi";
import { HarfCubugu, SayfaGezinme } from "./harf-cubugu";

export default async function HastalarSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; harf?: string; sayfa?: string }>;
}) {
  const { ctx, bag } = await panelBaglami();
  const bildirimGorulebilir = ctx.rol === "klinik_admin" || ctx.rol === "resepsiyon";
  const bildirimAdedi = bildirimGorulebilir ? await bildirimSayisi(bag) : 0;

  const { q, harf: harfParam, sayfa: sayfaParam } = await searchParams;
  const arama = q?.trim() ?? "";
  const harf = harfParametresiCoz(harfParam);

  // Arama yoksa: ada göre harf çubuğu + 50'lik sayfalar (hasta_harf_listesi, Türkçe alfabe sırası).
  let hastalar: HastaListeSatiri[] = [];
  let error: { message: string } | null = null;
  let harfSayilari: Map<string, number> | null = null;
  let toplamKayit = 0;
  let sayfa = 1;

  try {
    const v = await withTenant(bag, async (tx) => {
      if (arama) {
        return { hastalar: await listeEkVerisiGetir(tx, await hastaAra(tx, arama, 50)), harfSayilari: null, toplamKayit: 0, sayfa: 1 };
      }
      const { sayilar, toplam } = harfSayilariniTopla(await harfSayilariGetir(tx));
      const toplamK = harf ? (sayilar.get(harf) ?? 0) : toplam;
      const sayfaNo = sayfaParametresiCoz(sayfaParam, toplamK);
      const satirlar = await harfListesiGetir(tx, harf === null ? null : harf === DIGER ? DIGER : harfAnahtari(harf), (sayfaNo - 1) * SAYFA_BOYUTU, SAYFA_BOYUTU);
      return { hastalar: await listeEkVerisiGetir(tx, satirlar), harfSayilari: sayilar, toplamKayit: toplamK, sayfa: sayfaNo };
    });
    ({ hastalar, harfSayilari, toplamKayit, sayfa } = v);
  } catch (e) {
    console.error("Hasta listesi çekilemedi:", e);
    error = { message: "Liste çekilemedi." };
  }

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24 sm:max-w-3xl sm:p-8 lg:max-w-5xl">
        <PageHeader
          title="Hastalar"
          description="Hasta kayıtlarını görüntüle, ekle ve düzenle."
          actions={
            <>
              {bildirimGorulebilir && <BildirimButonu sayisi={bildirimAdedi} />}
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link href="/panel/hastalar/kayit-formu" target="_blank">
                    <FileText /> Kayıt Formu (PDF)
                  </Link>
                }
              />
              <YeniHastaDialog />
            </>
          }
        />

        <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur-sm sm:mx-0 sm:px-0">
          <HastaAramaKutusu baslangic={arama} />
        </div>

        {!arama && harfSayilari && (
          <HarfCubugu
            secili={harf}
            sayilar={harfSayilari}
            toplam={[...harfSayilari.values()].reduce((a, b) => a + b, 0)}
          />
        )}

        {error && (
          <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
        )}
        {!error && hastalar.length === 0 && (
          <EmptyState
            icon={Users}
            title={arama ? "Aramayla eşleşen hasta yok." : harf ? "Bu harfle başlayan hasta yok." : "Henüz hasta kaydı yok."}
          />
        )}
        {!error && hastalar.length > 0 && (
          <>
            {/* <768px: kart listesi (mevcut, korunmuş) */}
            <ul className="flex flex-col gap-3 md:hidden">
              {hastalar.map((hasta, i) => (
                <HastaSatiri key={hasta.id} hasta={hasta} gecikme={i * 40} />
              ))}
            </ul>
            {/* ≥768px: docs/DESIGN.md §3 tablo deseni */}
            <div className="hidden md:block">
              <HastaTablosu hastalar={hastalar} />
            </div>
          </>
        )}
        {!arama && !error && toplamKayit > SAYFA_BOYUTU && (
          <SayfaGezinme harf={harf} sayfa={sayfa} toplamKayit={toplamKayit} />
        )}
      </div>
    </div>
  );
}

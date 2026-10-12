import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hastaAra } from "@/lib/hasta/arama";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { BildirimButonu } from "@/components/panel/bildirim-butonu";
import type { HastaListeSatiri } from "@/types/hasta";
import { YeniHastaDialog } from "./yeni-hasta-dialog";
import { HastaSatiri } from "./hasta-satiri";
import { HastaTablosu } from "./hasta-tablosu";
import { HastaAramaKutusu } from "./hasta-arama-kutusu";
import { bildirimSayisiGetir } from "./bildirimler/bildirim-sayisi";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
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
  const supabase = await createClient();

  const oturum = await gecerliKullanici();
  if (!oturum) {
    redirect("/giris");
  }
  const { kullanici } = oturum;
  const bildirimGorulebilir = kullanici?.rol === "klinik_admin" || kullanici?.rol === "resepsiyon";
  const bildirimSayisi = bildirimGorulebilir ? await bildirimSayisiGetir(supabase) : 0;

  const { q, harf: harfParam, sayfa: sayfaParam } = await searchParams;
  const arama = q?.trim() ?? "";
  const harf = harfParametresiCoz(harfParam);

  const listeKolonlari =
    "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, eposta, hasta_hassas(adres)";
  type ListeSatiri = Omit<HastaListeSatiri, "bakiye">;

  // Arama yoksa: ada göre harf çubuğu + 50'lik sayfalar (hasta_harf_listesi, Türkçe alfabe sırası).
  // RPC'ler yoksa (migration 20261012150000 uygulanmadan deploy) harf çubuğu gizlenir, düz
  // ad_soyad sırasıyla sayfalanır.
  let data: ListeSatiri[] | null = null;
  let error: { message: string } | null = null;
  let harfSayilari: Map<string, number> | null = null;
  let toplamKayit = 0;
  let sayfa = 1;

  if (arama) {
    ({ data, error } = await hastaAra<ListeSatiri>(supabase, arama, listeKolonlari, 50));
  } else {
    const sayimSonucu = await supabase.rpc("hasta_bas_harf_sayilari");
    const rpcYok = sayimSonucu.error && ["PGRST202", "42883"].includes(sayimSonucu.error.code ?? "");

    if (!rpcYok) {
      if (sayimSonucu.error) {
        error = sayimSonucu.error;
      } else {
        const { sayilar, toplam } = harfSayilariniTopla((sayimSonucu.data ?? []) as { harf: string | null; adet: number }[]);
        harfSayilari = sayilar;
        toplamKayit = harf ? (sayilar.get(harf) ?? 0) : toplam;
        sayfa = sayfaParametresiCoz(sayfaParam, toplamKayit);
        const sonuc = await supabase
          .rpc("hasta_harf_listesi", {
            p_harf: harf === null ? null : harf === DIGER ? DIGER : harfAnahtari(harf),
            p_bas: (sayfa - 1) * SAYFA_BOYUTU,
            p_adet: SAYFA_BOYUTU,
          })
          .select(listeKolonlari);
        data = (sonuc.data ?? null) as ListeSatiri[] | null;
        error = sonuc.error;
      }
    } else {
      const { count } = await supabase.from("hasta").select("id", { count: "exact", head: true });
      toplamKayit = count ?? 0;
      sayfa = sayfaParametresiCoz(sayfaParam, toplamKayit);
      const sonuc = await supabase
        .from("hasta")
        .select(listeKolonlari)
        .order("ad_soyad")
        .order("id")
        .range((sayfa - 1) * SAYFA_BOYUTU, sayfa * SAYFA_BOYUTU - 1)
        .returns<ListeSatiri[]>();
      data = sonuc.data;
      error = sonuc.error;
    }
  }
  const hastalarHam = data ?? [];

  const hastaIdler = hastalarHam.map((h) => h.id);

  // v_hasta_ozet/v_hasta_detay_ozet view olduğu için PostgREST'in FK-tabanlı
  // embed'i çalışmıyor (types/hasta.ts'teki mevcut not, aynı kısıt Faz 3.2'de
  // v_hasta_detay_ozet için de doğrulandı) — ikisi de Map ile eşleniyor.
  // paket_satis→paket GERÇEK bir tablo FK'sı olduğu için embed sorunsuz çalışıyor.
  const [ozetSonucu, protokolSonucu, paketSonucu] =
    hastaIdler.length > 0
      ? await Promise.all([
          supabase.from("v_hasta_ozet").select("hasta_id, bakiye").in("hasta_id", hastaIdler),
          supabase.from("v_hasta_detay_ozet").select("hasta_id, aktif_protokol_ad").in("hasta_id", hastaIdler),
          supabase
            .from("paket_satis")
            .select("hasta_id, kalan_adet, paket(seans_sayisi)")
            .eq("durum", "aktif")
            .in("hasta_id", hastaIdler)
            .returns<{ hasta_id: string; kalan_adet: number; paket: { seans_sayisi: number } | null }[]>(),
        ])
      : [{ data: [] as { hasta_id: string; bakiye: number }[] }, { data: [] as { hasta_id: string; aktif_protokol_ad: string | null }[] }, { data: [] as { hasta_id: string; kalan_adet: number; paket: { seans_sayisi: number } | null }[] }];

  const bakiyeMap = new Map((ozetSonucu.data ?? []).map((b) => [b.hasta_id, b.bakiye]));
  const protokolMap = new Map((protokolSonucu.data ?? []).map((p) => [p.hasta_id, p.aktif_protokol_ad]));

  const paketToplamMap = new Map<string, { kalan: number; toplam: number }>();
  for (const satir of paketSonucu.data ?? []) {
    if (!satir.paket) continue;
    const mevcut = paketToplamMap.get(satir.hasta_id) ?? { kalan: 0, toplam: 0 };
    mevcut.kalan += satir.kalan_adet;
    mevcut.toplam += satir.paket.seans_sayisi;
    paketToplamMap.set(satir.hasta_id, mevcut);
  }

  const hastalar: HastaListeSatiri[] = hastalarHam.map((h) => {
    const paket = paketToplamMap.get(h.id);
    return {
      ...h,
      bakiye: bakiyeMap.get(h.id) ?? 0,
      aktif_protokol_ad: protokolMap.get(h.id) ?? null,
      paketIlerleme: paket && paket.toplam > 0 ? { kullanilan: paket.toplam - paket.kalan, toplam: paket.toplam } : null,
    };
  });

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24 sm:max-w-3xl sm:p-8 lg:max-w-5xl">
        <PageHeader
          title="Hastalar"
          description="Hasta kayıtlarını görüntüle, ekle ve düzenle."
          actions={
            <>
              {bildirimGorulebilir && <BildirimButonu sayisi={bildirimSayisi} />}
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

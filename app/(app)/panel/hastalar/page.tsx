import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
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

export default async function HastalarSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();

  const oturum = await gecerliKullanici();
  if (!oturum) {
    redirect("/giris");
  }
  const { kullanici } = oturum;
  const bildirimGorulebilir = kullanici?.rol === "klinik_admin" || kullanici?.rol === "resepsiyon";
  const bildirimSayisi = bildirimGorulebilir ? await bildirimSayisiGetir(supabase) : 0;

  const { q } = await searchParams;
  const arama = q?.trim() ?? "";

  let sorgu = supabase
    .from("hasta")
    .select(
      "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, eposta, hasta_hassas(adres)"
    )
    .order("ad_soyad")
    .limit(50);

  if (arama) {
    const guvenliArama = arama.replace(/[,()%]/g, "");
    sorgu = sorgu.or(`ad_soyad.ilike.%${guvenliArama}%,telefon.ilike.%${guvenliArama}%`);
  }

  const { data, error } = await sorgu.returns<Omit<HastaListeSatiri, "bakiye">[]>();
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

        {error && (
          <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
        )}
        {!error && hastalar.length === 0 && (
          <EmptyState
            icon={Users}
            title={arama ? "Aramayla eşleşen hasta yok." : "Henüz hasta kaydı yok."}
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
      </div>
    </div>
  );
}

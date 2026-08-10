"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adSoyadMaskele, cn, gunAraligi } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { TabletBackground } from "@/components/tablet/TabletBackground";
import { TabletLogo } from "@/components/tablet/TabletLogo";
import { TabletSaat } from "@/components/tablet/TabletSaat";
import { DurumRozeti } from "@/components/tablet/DurumRozeti";
import { EkranKorucusu } from "@/components/tablet/EkranKorucusu";
import { ODA_DURUMU } from "@/lib/tablet/oda-durumu";
import { odaDurumuHesapla } from "@/lib/tablet/oda-durumu-hesapla";
import { useIdle } from "@/lib/tablet/use-idle";
import { useMinuteTick } from "@/lib/hooks/use-minute-tick";
import { SeansSonuAnketQr } from "./seans-sonu-anket-qr";
import type { RandevuSatir } from "@/types/randevu";
import type { Klinik } from "@/types/klinik";
import type { TabletAyarlari } from "@/types/tablet-ayarlari";

const RANDEVU_SELECT =
  "id, baslangic, bitis, durum, hasta_id, hasta(ad_soyad), oda(ad), terapist(personel(ad_soyad)), islem_tanimi(id, ad)";

const NOTR_RENK = "#64748B";

export function TabletEkrani({
  odaId,
  odaAdi,
  klinik,
  baslangicRandevular,
  ayarlar,
  canliBaglanti = true,
}: {
  odaId: string;
  odaAdi: string;
  klinik: Klinik;
  baslangicRandevular: RandevuSatir[];
  ayarlar: TabletAyarlari;
  /** false ise realtime aboneliği hiç kurulmaz — sadece /tablet-onizleme QA rotası için (sahte odaId gerçek bağlantıyı anlamsız kılar). */
  canliBaglanti?: boolean;
}) {
  const [randevular, setRandevular] = useState(baslangicRandevular);
  // SSR'da null döner (bkz. use-minute-tick.ts) — sunucu/istemci arasında
  // "simdi"ye bağlı türetilen değerler (durum, kalan süre yüzdesi) hidrasyon
  // uyuşmazlığı yaratmasın diye, simdi hazır olana kadar iskelet gösterilir.
  const simdi = useMinuteTick();
  const [baglantiDurumu, setBaglantiDurumu] = useState<"online" | "offline">("online");
  const [sonGuncelleme, setSonGuncelleme] = useState(() => new Date());
  const [yenileniyor, setYenileniyor] = useState(false);
  const bosta = useIdle(5 * 60_000);

  useEffect(() => {
    if (!canliBaglanti) return;

    const supabase = createClient();
    let kanal: ReturnType<typeof supabase.channel> | null = null;
    let iptalEdildi = false;

    async function gunlukListeyiYenile() {
      setYenileniyor(true);
      const { baslangic, bitis } = gunAraligi();
      const { data } = await supabase
        .from("randevu")
        .select(RANDEVU_SELECT)
        .eq("oda_id", odaId)
        .gte("baslangic", baslangic)
        .lt("baslangic", bitis)
        .order("baslangic")
        .returns<RandevuSatir[]>();

      if (data) {
        setRandevular(data);
        setSonGuncelleme(new Date());
      }
      setYenileniyor(false);
    }

    async function abonelikKur() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
      if (iptalEdildi) return;

      kanal = supabase
        .channel(`randevu-oda-${odaId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "randevu", filter: `oda_id=eq.${odaId}` },
          () => {
            gunlukListeyiYenile();
          }
        )
        .subscribe((status) => {
          setBaglantiDurumu(status === "SUBSCRIBED" ? "online" : "offline");
        });
    }

    abonelikKur();

    return () => {
      iptalEdildi = true;
      if (kanal) {
        supabase.removeChannel(kanal);
      }
    };
  }, [odaId, canliBaglanti]);

  const { mevcut, sonraki } = useMemo(() => {
    const icerdeOlan = randevular.find((r) => r.durum === "geldi" || r.durum === "gecikmeli_geldi");
    if (icerdeOlan) {
      return { mevcut: icerdeOlan, sonraki: null };
    }

    if (!simdi) {
      return { mevcut: null, sonraki: null };
    }

    const gelecekPlanli = randevular
      .filter((r) => r.durum === "planlandi" && new Date(r.baslangic) >= simdi)
      .sort((a, b) => new Date(a.baslangic).getTime() - new Date(b.baslangic).getTime());

    return { mevcut: null, sonraki: gelecekPlanli[0] ?? null };
  }, [randevular, simdi]);

  // Seans sonu anket QR'ı: oda boşken (mevcut===null), o gün bu odada
  // tamamlanmış (en son biteni) randevu varsa gösterilir. mevcut her zaman
  // geldi/gecikmeli_geldi'ye öncelikli olduğu için sonraki hasta check-in
  // olduğunda bu otomatik null'a düşer — ayrı bir "kaybol" tetikleyicisi
  // gerekmiyor (kullanıcı kararı: "seans tamamlanınca gözüksün diğer hasta
  // gelene kadar").
  const sonTamamlanan = useMemo(() => {
    if (mevcut) return null;
    const tamamlananlar = randevular.filter((r) => r.durum === "tamamlandi");
    if (tamamlananlar.length === 0) return null;
    return tamamlananlar.reduce((enSon, r) =>
      new Date(r.bitis).getTime() > new Date(enSon.bitis).getTime() ? r : enSon
    );
  }, [randevular, mevcut]);

  const durum = useMemo(
    () => (simdi ? odaDurumuHesapla(mevcut, sonraki, simdi) : "musait"),
    [mevcut, sonraki, simdi]
  );
  const durumBilgisi = ODA_DURUMU[durum];
  const renk = ayarlar.durum_rengi_goster ? durumBilgisi.renk : NOTR_RENK;
  const auraOpacity = ayarlar.durum_rengi_goster ? durumBilgisi.auraOpacity : 0;

  // KVKK: soyad her zaman maskelenir (opsiyonel değil, bkz. kullanıcı kararı).
  function hastaAdiGoster(adSoyad: string | undefined | null) {
    if (!adSoyad) return "—";
    return adSoyadMaskele(adSoyad);
  }

  // "mesgul" ise mevcut, "hazirlaniyor" ise sonraki — ikisinde de merkez blok
  // hasta/terapist/işlem gösterir. "musait" durumunda gösterilecek hasta yok,
  // büyük metin durum etiketi olur (bkz. plan notları).
  const odaSahibi = durum === "mesgul" ? mevcut : durum === "hazirlaniyor" ? sonraki : null;

  const kalanDakika =
    durum === "mesgul" && mevcut && simdi
      ? Math.max(0, Math.ceil((new Date(mevcut.bitis).getTime() - simdi.getTime()) / 60_000))
      : null;
  const ilerlemeYuzde =
    durum === "mesgul" && mevcut && simdi
      ? Math.min(
          100,
          Math.max(
            0,
            ((simdi.getTime() - new Date(mevcut.baslangic).getTime()) /
              (new Date(mevcut.bitis).getTime() - new Date(mevcut.baslangic).getTime())) *
              100
          )
        )
      : null;

  return (
    <div
      className={cn(
        ayarlar.tema === "koyu" ? "dark" : "light",
        "relative flex min-h-screen flex-col overflow-hidden bg-tablet-zemin text-foreground"
      )}
    >
      <TabletBackground renk={renk} auraOpacity={auraOpacity} />
      {ayarlar.durum_rengi_goster && (
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: "5px", backgroundColor: durumBilgisi.renk }}
        />
      )}

      <header className="relative z-10 flex items-center justify-between p-6">
        <div className="flex items-center gap-3">
          <TabletLogo klinik={klinik} tema={ayarlar.tema} />
          <div className="h-6 w-px" style={{ backgroundColor: "rgba(148,163,184,0.25)" }} />
          <span className="text-base font-medium">{odaAdi}</span>
        </div>

        <div className="flex items-center gap-4">
          {baglantiDurumu === "offline" && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
              Çevrimdışı · son güncelleme {formatTime(sonGuncelleme.toISOString())}
            </span>
          )}
          <TabletSaat />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Oda değiştir"
            nativeButton={false}
            render={
              <Link href="/panel/tablet">
                <Home />
              </Link>
            }
          />
        </div>
      </header>

      {bosta ? (
        <EkranKorucusu klinik={klinik} tema={ayarlar.tema} />
      ) : (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          {yenileniyor || !simdi ? (
            <div className="flex flex-col items-center gap-4">
              <div className="h-7 w-32 animate-pulse rounded-full bg-muted" />
              <div className="h-14 w-80 animate-pulse rounded-xl bg-muted" />
              <div className="h-5 w-48 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : (
            <>
              {ayarlar.durum_rengi_goster && !sonTamamlanan && <DurumRozeti durum={durum} />}

              {odaSahibi ? (
                <>
                  {ayarlar.hasta_adi_goster && (
                    <span className="text-5xl font-medium tracking-tight md:text-6xl">
                      {hastaAdiGoster(odaSahibi.hasta?.ad_soyad)}
                    </span>
                  )}
                  {ayarlar.terapist_adi_goster && (
                    <span className="text-lg text-foreground/80">
                      {odaSahibi.terapist?.personel?.ad_soyad ?? "—"}
                      {durum === "hazirlaniyor" && ` · ${formatTime(odaSahibi.baslangic)}`}
                    </span>
                  )}
                  {ayarlar.islem_adi_goster && (
                    <span className="text-base text-muted-foreground">
                      {odaSahibi.islem_tanimi?.ad ?? "—"}
                    </span>
                  )}
                </>
              ) : sonTamamlanan ? (
                <SeansSonuAnketQr randevuId={sonTamamlanan.id} />
              ) : (
                <>
                  <span className="text-5xl font-medium tracking-tight md:text-6xl">
                    {durumBilgisi.etiket}
                  </span>
                  {sonraki && (
                    <span className="text-lg text-foreground/80">
                      Sıradaki: {formatTime(sonraki.baslangic)} ·{" "}
                      {sonraki.terapist?.personel?.ad_soyad ?? "—"}
                    </span>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {!bosta && durum === "mesgul" && kalanDakika !== null && ilerlemeYuzde !== null && (
        <footer className="relative z-10 flex flex-col gap-2 p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Kalan süre</span>
            <span className="font-medium tabular-nums">{kalanDakika} dk</span>
          </div>
          <div
            className="w-full overflow-hidden rounded-full"
            style={{ height: "3px", backgroundColor: "rgba(148,163,184,0.18)" }}
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${ilerlemeYuzde}%`, backgroundColor: renk }}
            />
          </div>
        </footer>
      )}
    </div>
  );
}

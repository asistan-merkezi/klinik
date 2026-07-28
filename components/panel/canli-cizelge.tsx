"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { gunAraligi } from "@/lib/utils";
import { startOfDayUTC } from "@/lib/datetime";
import type { RandevuSatir } from "@/types/randevu";
import { Activity, Users } from "lucide-react";
import { CanliSaat } from "@/components/panel/canli-saat";
import { SuAnCizgisi } from "@/components/panel/su-an-cizgisi";
import { RandevuKutusu, gorunumDurumuHesapla } from "@/components/panel/randevu-kutusu";

const GUN_BASLANGIC_SAAT = 8;
const GUN_BITIS_SAAT = 20;
const PX_PER_DAKIKA = 2;
const TOPLAM_DAKIKA = (GUN_BITIS_SAAT - GUN_BASLANGIC_SAAT) * 60;
const SAAT_ETIKETLERI = Array.from(
  { length: GUN_BITIS_SAAT - GUN_BASLANGIC_SAAT + 1 },
  (_, i) => GUN_BASLANGIC_SAAT + i
);

/**
 * Bugünün (İstanbul takvim günü) GUN_BASLANGIC_SAAT'i, epoch ms olarak.
 * Önceden tarayıcının ambient TZ'sinde `setHours` ile hesaplanıyordu — bu,
 * tarayıcı İstanbul dışında bir TZ'de olduğunda çizelgeyi kaydırıyordu.
 * Artık lib/datetime.ts'teki tek TZ kaynağından türetiliyor.
 */
function gunBaslangiciMs(baz: Date) {
  return new Date(startOfDayUTC(baz)).getTime() + GUN_BASLANGIC_SAAT * 60 * 60 * 1000;
}

function dakikaFarki(baslangicMs: number, tarih: string) {
  return (new Date(tarih).getTime() - baslangicMs) / 60_000;
}

export function CanliCizelge({ baslangicRandevular }: { baslangicRandevular: RandevuSatir[] }) {
  const [randevular, setRandevular] = useState(baslangicRandevular);
  const [simdi, setSimdi] = useState<Date | null>(null);
  const kaydirildiRef = useRef(false);

  useEffect(() => {
    setSimdi(new Date());
    const id = setInterval(() => setSimdi(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let kanal: ReturnType<typeof supabase.channel> | null = null;
    let iptalEdildi = false;

    async function listeyiYenile() {
      const { baslangic, bitis } = gunAraligi();
      const { data } = await supabase
        .from("randevu")
        .select(
          "id, baslangic, bitis, durum, musteri(ad_soyad), oda(ad), terapist(personel(ad_soyad))"
        )
        .gte("baslangic", baslangic)
        .lt("baslangic", bitis)
        .order("baslangic")
        .returns<RandevuSatir[]>();

      if (data) {
        setRandevular(data);
      }
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
        .channel("randevu-panel-canli")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "randevu" },
          () => {
            listeyiYenile();
          }
        )
        .subscribe();
    }

    abonelikKur();

    return () => {
      iptalEdildi = true;
      if (kanal) {
        supabase.removeChannel(kanal);
      }
    };
  }, []);

  const gunBaslangicMs = useMemo(() => gunBaslangiciMs(simdi ?? new Date()), []); // eslint-disable-line react-hooks/exhaustive-deps

  const gorunumler = useMemo(() => {
    if (!simdi) return [];
    return randevular.map((randevu) => ({
      randevu,
      durum: gorunumDurumuHesapla(randevu, simdi),
    }));
  }, [randevular, simdi]);

  const devamEdenler = useMemo(
    () => gorunumler.filter((g) => g.durum === "seansta"),
    [gorunumler]
  );

  const aktifRandevuId = devamEdenler[0]?.randevu.id ?? null;

  useEffect(() => {
    if (kaydirildiRef.current || !aktifRandevuId) return;
    const el = document.getElementById(`randevu-${aktifRandevuId}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      kaydirildiRef.current = true;
    }
  }, [aktifRandevuId]);

  const duyuruMetni =
    devamEdenler.length > 0
      ? `Şu an seansta: ${devamEdenler
          .map((g) => g.randevu.musteri?.ad_soyad ?? "—")
          .join(", ")}`
      : "Şu an aktif seans yok";

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card text-card-foreground">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Günün Çizelgesi</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary ring-1 ring-inset ring-primary/30">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            <span className="hidden sm:inline">Canlı senkronizasyon</span>
            <span className="sm:hidden">Canlı</span>
          </span>
          <CanliSaat />
        </div>
      </header>

      <p aria-live="polite" className="sr-only">
        {duyuruMetni}
      </p>

      <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-5">
        {randevular.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Bugün için randevu yok.</p>
        ) : (
          <>
            {/* ≥lg: saat ızgaralı yerleşim */}
            <div
              className="relative hidden lg:block"
              style={{ height: `${TOPLAM_DAKIKA * PX_PER_DAKIKA}px` }}
            >
              {SAAT_ETIKETLERI.map((saat, i) => (
                <div
                  key={saat}
                  className="absolute inset-x-0 flex items-center"
                  style={{ top: `${i * 60 * PX_PER_DAKIKA}px` }}
                  aria-hidden
                >
                  <span className="tabular-nums w-12 shrink-0 font-mono text-xs text-muted-foreground">
                    {String(saat).padStart(2, "0")}:00
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ))}

              <div className="relative ml-12 h-full">
                {gorunumler.map(({ randevu, durum }) => {
                  const top = dakikaFarki(gunBaslangicMs, randevu.baslangic) * PX_PER_DAKIKA;
                  const bitisFarki = dakikaFarki(gunBaslangicMs, randevu.bitis);
                  const baslangicFarki = dakikaFarki(gunBaslangicMs, randevu.baslangic);
                  const yukseklik = Math.max((bitisFarki - baslangicFarki) * PX_PER_DAKIKA - 6, 32);

                  return (
                    <div
                      key={randevu.id}
                      className="absolute inset-x-0"
                      style={{ top: `${top}px`, height: `${yukseklik}px` }}
                    >
                      <RandevuKutusu randevu={randevu} gorunumDurumu={durum} />
                    </div>
                  );
                })}

                {simdi && (
                  <SuAnCizgisi
                    gunBaslangicMs={gunBaslangicMs}
                    pxPerDakika={PX_PER_DAKIKA}
                    toplamDakika={TOPLAM_DAKIKA}
                  />
                )}
              </div>
            </div>

            {/* <lg: dikey liste */}
            <ul className="flex flex-col gap-2 lg:hidden">
              {gorunumler.map(({ randevu, durum }) => (
                <li key={randevu.id}>
                  {durum === "seansta" && (
                    <div className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold text-primary">
                      <span className="h-px flex-1 bg-primary/40" />
                      Şu an
                      <span className="h-px flex-1 bg-primary/40" />
                    </div>
                  )}
                  <RandevuKutusu randevu={randevu} gorunumDurumu={durum} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
          {devamEdenler.length > 0
            ? `${devamEdenler.length} muayene devam ediyor`
            : "Şu an aktif seans yok"}
        </span>
      </footer>
    </div>
  );
}

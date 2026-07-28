"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { gunAraligi } from "@/lib/utils";
import { startOfDayUTC } from "@/lib/datetime";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import { Activity, Users } from "lucide-react";
import { CanliSaat } from "@/components/panel/canli-saat";
import { SuAnCizgisi } from "@/components/panel/su-an-cizgisi";
import { RandevuKutusu, gorunumDurumuHesapla } from "@/components/panel/randevu-kutusu";

const GUN_BASLANGIC_SAAT = 8;
const GUN_BITIS_SAAT = 20;
const PX_PER_DAKIKA = 3;
const TOPLAM_DAKIKA = (GUN_BITIS_SAAT - GUN_BASLANGIC_SAAT) * 60;
const ODA_SUTUN_GENISLIK = 128;
const SATIR_YUKSEKLIK = 76;
const SAAT_ETIKETLERI = Array.from(
  { length: GUN_BITIS_SAAT - GUN_BASLANGIC_SAAT + 1 },
  (_, i) => GUN_BASLANGIC_SAAT + i
);

/**
 * Bugünün (İstanbul takvim günü) GUN_BASLANGIC_SAAT'i, epoch ms olarak.
 * lib/datetime.ts'teki tek TZ kaynağından türetilir — tarayıcının ambient
 * TZ'sine bağımlı değildir.
 */
function gunBaslangiciMs(baz: Date) {
  return new Date(startOfDayUTC(baz)).getTime() + GUN_BASLANGIC_SAAT * 60 * 60 * 1000;
}

function dakikaFarki(baslangicMs: number, tarih: string) {
  return (new Date(tarih).getTime() - baslangicMs) / 60_000;
}

const RANDEVU_SELECT =
  "id, baslangic, bitis, durum, oda_id, musteri(ad_soyad), oda(ad), terapist(personel(ad_soyad)), islem_tanimi_id, islem_tanimi(id, ad)";

export function CanliCizelge({
  baslangicRandevular,
  odalar,
}: {
  baslangicRandevular: RandevuSatir[];
  odalar: SecenekSatir[];
}) {
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
        .select(RANDEVU_SELECT)
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

  // Aktif oda listesi + randevusu olup da (oda pasife alınmış olabilir)
  // listede yer almayan odalar da alta "Diğer" olarak eklenir — veri
  // sessizce kaybolmasın.
  const satirlar = useMemo(() => {
    const taninanOdaIdler = new Set(odalar.map((o) => o.id));
    const digerOdalar = new Map<string, string>();
    for (const { randevu } of gorunumler) {
      if (randevu.oda_id && !taninanOdaIdler.has(randevu.oda_id)) {
        digerOdalar.set(randevu.oda_id, randevu.oda?.ad ?? "Diğer");
      }
    }
    return [...odalar, ...[...digerOdalar.entries()].map(([id, ad]) => ({ id, ad }))];
  }, [odalar, gorunumler]);

  const gorunumlerByOda = useMemo(() => {
    const harita = new Map<string, typeof gorunumler>();
    for (const gorunum of gorunumler) {
      const odaId = gorunum.randevu.oda_id;
      if (!odaId) continue;
      const liste = harita.get(odaId) ?? [];
      liste.push(gorunum);
      harita.set(odaId, liste);
    }
    return harita;
  }, [gorunumler]);

  const devamEdenler = useMemo(
    () => gorunumler.filter((g) => g.durum === "seansta"),
    [gorunumler]
  );

  const aktifRandevuId = devamEdenler[0]?.randevu.id ?? null;

  useEffect(() => {
    if (kaydirildiRef.current || !aktifRandevuId) return;
    const el = document.getElementById(`randevu-${aktifRandevuId}`);
    if (el) {
      el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      kaydirildiRef.current = true;
    }
  }, [aktifRandevuId]);

  const duyuruMetni =
    devamEdenler.length > 0
      ? `Şu an seansta: ${devamEdenler
          .map((g) => g.randevu.musteri?.ad_soyad ?? "—")
          .join(", ")}`
      : "Şu an aktif seans yok";

  const gridGenislik = ODA_SUTUN_GENISLIK + TOPLAM_DAKIKA * PX_PER_DAKIKA;

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card text-card-foreground">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
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

      {satirlar.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
          Aktif oda tanımlı değil. Donanım ekranından oda ekleyin.
        </p>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto">
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <div style={{ width: `${gridGenislik}px` }}>
              {/* saat başlığı — dikey kaydırmada yapışkan */}
              <div className="sticky top-0 z-30 flex border-b border-border bg-card">
                <div
                  className="shrink-0 border-r border-border"
                  style={{ width: `${ODA_SUTUN_GENISLIK}px` }}
                  aria-hidden
                />
                <div className="relative h-8 flex-1">
                  {SAAT_ETIKETLERI.map((saat, i) => (
                    <div
                      key={saat}
                      className="absolute inset-y-0 flex items-center border-l border-border pl-1"
                      style={{ left: `${i * 60 * PX_PER_DAKIKA}px` }}
                    >
                      <span className="tabular-nums font-mono text-xs text-muted-foreground">
                        {String(saat).padStart(2, "0")}:00
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* oda satırları + dikey şu-an çizgisi */}
              <div className="relative">
                {satirlar.map((oda) => (
                  <div key={oda.id} className="flex border-b border-border last:border-b-0">
                    <div
                      className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card px-2 text-sm font-medium"
                      style={{ width: `${ODA_SUTUN_GENISLIK}px` }}
                    >
                      <span className="truncate">{oda.ad}</span>
                    </div>
                    <div className="relative flex-1" style={{ height: `${SATIR_YUKSEKLIK}px` }}>
                      {SAAT_ETIKETLERI.map((saat, i) => (
                        <div
                          key={saat}
                          className="absolute inset-y-0 border-l border-border/50"
                          style={{ left: `${i * 60 * PX_PER_DAKIKA}px` }}
                          aria-hidden
                        />
                      ))}

                      {(gorunumlerByOda.get(oda.id) ?? []).map(({ randevu, durum }) => {
                        const solKonum = dakikaFarki(gunBaslangicMs, randevu.baslangic) * PX_PER_DAKIKA;
                        const baslangicFarki = dakikaFarki(gunBaslangicMs, randevu.baslangic);
                        const bitisFarki = dakikaFarki(gunBaslangicMs, randevu.bitis);
                        const genislik = Math.max((bitisFarki - baslangicFarki) * PX_PER_DAKIKA - 4, 40);

                        return (
                          <div
                            key={randevu.id}
                            className="absolute inset-y-1"
                            style={{ left: `${solKonum}px`, width: `${genislik}px` }}
                          >
                            <RandevuKutusu randevu={randevu} gorunumDurumu={durum} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {simdi && (
                  <SuAnCizgisi
                    gunBaslangicMs={gunBaslangicMs}
                    pxPerDakika={PX_PER_DAKIKA}
                    toplamDakika={TOPLAM_DAKIKA}
                    solOffset={ODA_SUTUN_GENISLIK}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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

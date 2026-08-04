"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { gunAraligi } from "@/lib/utils";
import { startOfDayUTC, formatDateForInput, formatTimeForInput } from "@/lib/datetime";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import { Activity, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CanliSaat } from "@/components/panel/canli-saat";
import { SuAnCizgisi } from "@/components/panel/su-an-cizgisi";
import { RandevuKutusu, gorunumDurumuHesapla } from "@/components/panel/randevu-kutusu";
import { RandevuDetayPaneli } from "@/components/panel/randevu-detay-paneli";

const GUN_BASLANGIC_SAAT = 8;
const GUN_BITIS_SAAT = 20;
const PX_PER_DAKIKA = 1;
const TOPLAM_DAKIKA = (GUN_BITIS_SAAT - GUN_BASLANGIC_SAAT) * 60;
const SAAT_SUTUN_GENISLIK = 56;
const ODA_SUTUN_GENISLIK = 80;
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

/** Boş alana tıklanınca en yakın 15 dakikaya yuvarlar (daha kullanışlı varsayılan saat). */
function dakikaYuvarla(dakika: number) {
  return Math.round(dakika / 15) * 15;
}

const RANDEVU_SELECT =
  "id, baslangic, bitis, durum, gecikme_dakika, hasta_id, terapist_id, oda_id, cihaz_id, hasta(ad_soyad), oda(ad), terapist(personel(ad_soyad)), islem_tanimi_id, islem_tanimi(id, ad), tani, antrenor_id, antrenor:personel(ad_soyad), tedavi_protokolu_id, tedavi_protokolu(id, ad)";

export function CanliCizelge({
  baslangicRandevular,
  odalar,
  terapistler,
  cihazlar,
  tedaviler,
  antrenorler,
  protokoller,
  tarihNavigasyonuGoster = false,
  rol = null,
  kendiTerapistId = null,
}: {
  baslangicRandevular: RandevuSatir[];
  odalar: SecenekSatir[];
  terapistler: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
  antrenorler: SecenekSatir[];
  protokoller: SecenekSatir[];
  /** true ise başlıkta gün ileri/geri + tarih seçici gösterilir, geçmiş/gelecek günler görüntülenebilir. */
  tarihNavigasyonuGoster?: boolean;
  /** klinik_admin ve, kendi randevusu için, terapist "seansta" kutucuğunu hasta detayına link olarak kullanabilir. */
  rol?: string | null;
  /** rol==="terapist" ise kendi terapist.id'si — sadece kendi randevularında link aktif olsun diye. */
  kendiTerapistId?: string | null;
}) {
  const router = useRouter();
  const [randevular, setRandevular] = useState(baslangicRandevular);
  const [simdi, setSimdi] = useState<Date | null>(null);
  const [seciliTarih, setSeciliTarih] = useState(() => formatDateForInput(new Date().toISOString()));
  const [seciliRandevu, setSeciliRandevu] = useState<RandevuSatir | null>(null);
  const [detayAcik, setDetayAcik] = useState(false);
  const kaydirildiRef = useRef(false);
  const kaydirmaKapRef = useRef<HTMLDivElement>(null);
  const ilkCalismaRef = useRef(true);

  const bugunMu = simdi ? seciliTarih === formatDateForInput(simdi.toISOString()) : true;

  useEffect(() => {
    setSimdi(new Date());
    const id = setInterval(() => setSimdi(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    kaydirildiRef.current = false;
  }, [seciliTarih]);

  useEffect(() => {
    const supabase = createClient();
    let kanal: ReturnType<typeof supabase.channel> | null = null;
    let iptalEdildi = false;

    async function listeyiYenile() {
      const { baslangic, bitis } = gunAraligi(new Date(seciliTarih));
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

    // İlk mount'ta sunucudan gelen baslangicRandevular zaten güncel; sadece
    // tarih değiştirildiğinde (gezinme) anında tazeleme gerekir.
    if (!ilkCalismaRef.current) {
      listeyiYenile();
    }
    ilkCalismaRef.current = false;

    abonelikKur();

    return () => {
      iptalEdildi = true;
      if (kanal) {
        supabase.removeChannel(kanal);
      }
    };
  }, [seciliTarih]);

  const gunBaslangicMs = useMemo(() => gunBaslangiciMs(new Date(seciliTarih)), [seciliTarih]);

  function gunKaydir(delta: number) {
    const yeni = new Date(seciliTarih);
    yeni.setUTCDate(yeni.getUTCDate() + delta);
    setSeciliTarih(formatDateForInput(yeni.toISOString()));
  }

  function bosAlanaTiklandi(e: React.MouseEvent<HTMLDivElement>, odaId: string) {
    const dikdortgen = e.currentTarget.getBoundingClientRect();
    const gorecelKonum = e.clientY - dikdortgen.top;
    const dakika = Math.min(Math.max(dakikaYuvarla(gorecelKonum / PX_PER_DAKIKA), 0), TOPLAM_DAKIKA);
    const tiklananIso = new Date(gunBaslangicMs + dakika * 60_000).toISOString();
    const tarih = formatDateForInput(tiklananIso);
    const saat = formatTimeForInput(tiklananIso);
    router.push(`/panel/randevular?oda_id=${odaId}&tarih=${tarih}&saat=${saat}`);
  }

  /** Gelmiş (geldi/gecikmeli geldi/seansta) bir randevu için, sadece o hastanın randevusuna bakan terapist veya klinik_admin/super_admin için geçerli. */
  function gelenHastayaGitYetkisiVarMi(randevu: RandevuSatir) {
    if (rol === "klinik_admin" || rol === "super_admin") return true;
    if (rol === "terapist" && kendiTerapistId) return randevu.terapist_id === kendiTerapistId;
    return false;
  }

  function gelenHastaDurumuMu(durum: ReturnType<typeof gorunumDurumuHesapla>) {
    return durum === "seansta" || durum === "geldi" || durum === "gecikmeli_geldi";
  }

  function randevuKutusunaTiklandi(
    e: React.MouseEvent | React.KeyboardEvent,
    randevu: RandevuSatir,
    durum: ReturnType<typeof gorunumDurumuHesapla>
  ) {
    e.stopPropagation();
    if (gelenHastaDurumuMu(durum) && randevu.hasta_id && gelenHastayaGitYetkisiVarMi(randevu)) {
      router.push(`/panel/hastalar/${randevu.hasta_id}/tedavi`);
      return;
    }
    setSeciliRandevu(randevu);
    setDetayAcik(true);
  }

  const gorunumler = useMemo(() => {
    if (!simdi) return [];
    return randevular.map((randevu) => ({
      randevu,
      durum: gorunumDurumuHesapla(randevu, simdi),
    }));
  }, [randevular, simdi]);

  // Aktif oda listesi + randevusu olup da (oda pasife alınmış olabilir)
  // listede yer almayan odalar da sona "Diğer" olarak eklenir — veri
  // sessizce kaybolmasın.
  const sutunlar = useMemo(() => {
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

  useEffect(() => {
    if (kaydirildiRef.current || !simdi || !bugunMu) return;
    const kap = kaydirmaKapRef.current;
    if (!kap) return;
    const gecenDakika = (simdi.getTime() - gunBaslangicMs) / 60_000;
    const suAnUst = gecenDakika * PX_PER_DAKIKA;
    kap.scrollTop = suAnUst - kap.clientHeight / 2;
    kaydirildiRef.current = true;
  }, [simdi, gunBaslangicMs, bugunMu]);

  const duyuruMetni =
    devamEdenler.length > 0
      ? `Şu an seansta: ${devamEdenler
          .map((g) => g.randevu.hasta?.ad_soyad ?? "—")
          .join(", ")}`
      : "Şu an aktif seans yok";

  const gridYukseklik = TOPLAM_DAKIKA * PX_PER_DAKIKA;

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card text-card-foreground">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">
            {tarihNavigasyonuGoster ? "Randevu Çizelgesi" : "Günün Çizelgesi"}
          </h2>
        </div>

        {tarihNavigasyonuGoster && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => gunKaydir(-1)}
              aria-label="Önceki gün"
            >
              <ChevronLeft />
            </Button>
            <input
              type="date"
              value={seciliTarih}
              onChange={(e) => setSeciliTarih(e.target.value)}
              className="rounded-lg border border-input bg-transparent px-2 py-1 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => gunKaydir(1)}
              aria-label="Sonraki gün"
            >
              <ChevronRight />
            </Button>
            {!bugunMu && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSeciliTarih(formatDateForInput(new Date().toISOString()))}
              >
                Bugün
              </Button>
            )}
          </div>
        )}

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

      {sutunlar.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
          Aktif oda tanımlı değil. Donanım ekranından oda ekleyin.
        </p>
      ) : (
        <div
          ref={kaydirmaKapRef}
          className="max-h-[70vh] overflow-auto [-webkit-overflow-scrolling:touch]"
        >
          <div style={{ width: `${SAAT_SUTUN_GENISLIK + sutunlar.length * ODA_SUTUN_GENISLIK}px` }}>
              {/* oda başlığı — dikey kaydırmada yapışkan (tek scroll konteyneri sayesinde) */}
              <div className="sticky top-0 z-30 flex border-b border-border bg-card">
                <div
                  className="shrink-0 border-r border-border"
                  style={{ width: `${SAAT_SUTUN_GENISLIK}px` }}
                  aria-hidden
                />
                {sutunlar.map((oda) => (
                  <div
                    key={oda.id}
                    className="shrink-0 truncate border-l border-border px-2 py-2 text-sm font-medium"
                    style={{ width: `${ODA_SUTUN_GENISLIK}px` }}
                  >
                    {oda.ad}
                  </div>
                ))}
              </div>

              {/* saat sütunu + oda sütunları + yatay şu-an çizgisi */}
              <div className="flex" style={{ height: `${gridYukseklik}px` }}>
                <div
                  className="sticky left-0 z-20 shrink-0 border-r border-border bg-card"
                  style={{ width: `${SAAT_SUTUN_GENISLIK}px` }}
                >
                  {SAAT_ETIKETLERI.map((saat, i) => (
                    <div
                      key={saat}
                      className="absolute flex justify-end pr-1.5"
                      style={{ top: `${i * 60 * PX_PER_DAKIKA - 7}px`, width: `${SAAT_SUTUN_GENISLIK}px` }}
                    >
                      <span className="tabular-nums font-mono text-xs text-muted-foreground">
                        {String(saat).padStart(2, "0")}:00
                      </span>
                    </div>
                  ))}
                </div>

                <div className="relative flex flex-1">
                  {sutunlar.map((oda) => (
                    <div
                      key={oda.id}
                      className="relative shrink-0 cursor-crosshair border-l border-border"
                      style={{ width: `${ODA_SUTUN_GENISLIK}px` }}
                      onClick={(e) => bosAlanaTiklandi(e, oda.id)}
                      title="Randevu oluşturmak için tıklayın"
                    >
                      {SAAT_ETIKETLERI.map((saat, i) => (
                        <div
                          key={saat}
                          className="absolute inset-x-0 border-t border-border/50"
                          style={{ top: `${i * 60 * PX_PER_DAKIKA}px` }}
                          aria-hidden
                        />
                      ))}

                      {(gorunumlerByOda.get(oda.id) ?? []).map(({ randevu, durum }) => {
                        const ustKonum = dakikaFarki(gunBaslangicMs, randevu.baslangic) * PX_PER_DAKIKA;
                        const baslangicFarki = dakikaFarki(gunBaslangicMs, randevu.baslangic);
                        const bitisFarki = dakikaFarki(gunBaslangicMs, randevu.bitis);
                        const yukseklik = Math.max((bitisFarki - baslangicFarki) * PX_PER_DAKIKA - 4, 40);

                        const hastaLinki = gelenHastaDurumuMu(durum) && gelenHastayaGitYetkisiVarMi(randevu);

                        return (
                          <div
                            key={randevu.id}
                            className="absolute inset-x-1 cursor-pointer"
                            style={{ top: `${ustKonum}px`, height: `${yukseklik}px` }}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => randevuKutusunaTiklandi(e, randevu, durum)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                randevuKutusunaTiklandi(e, randevu, durum);
                              }
                            }}
                          >
                            <RandevuKutusu randevu={randevu} gorunumDurumu={durum} hastaLinki={hastaLinki} />
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {simdi && bugunMu && (
                    <SuAnCizgisi
                      gunBaslangicMs={gunBaslangicMs}
                      pxPerDakika={PX_PER_DAKIKA}
                      toplamDakika={TOPLAM_DAKIKA}
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

      <RandevuDetayPaneli
        open={detayAcik}
        onOpenChange={setDetayAcik}
        randevu={seciliRandevu}
        terapistler={terapistler}
        odalar={odalar}
        cihazlar={cihazlar}
        tedaviler={tedaviler}
        antrenorler={antrenorler}
        protokoller={protokoller}
      />
    </div>
  );
}

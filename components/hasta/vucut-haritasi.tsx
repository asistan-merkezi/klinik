"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  SIDDET_RENKLERI,
  SIDDET_ETIKETLERI,
  siddetBandi,
  bolgeBul,
  figurGorseli,
  yuzunBolgeleri,
  type Cinsiyet as FigurCinsiyeti,
  type VucutYuzu,
} from "@/lib/vucut-bolgeleri";
import type { Cinsiyet } from "@/types/hasta";
import {
  useVucutHaritasi,
  useVucutIsaretKaydet,
  useVucutIsaretKaldir,
} from "@/app/(app)/panel/hastalar/[id]/queries";

const YUZ_ETIKET: Record<VucutYuzu, string> = { on: "Ön", arka: "Arka" };

function etkinCinsiyet(cinsiyet: Cinsiyet | null | undefined): FigurCinsiyeti {
  return cinsiyet === "kadin" ? "kadin" : "erkek";
}

function gorselPrefetchEt(cinsiyet: FigurCinsiyeti, yuz: VucutYuzu) {
  if (typeof window === "undefined") return;
  const img = new window.Image();
  img.src = figurGorseli(cinsiyet, yuz);
}

export function VucutHaritasi({
  hastaId,
  seansId = null,
  duzenlenebilir = false,
  cinsiyet = null,
}: {
  hastaId: string;
  seansId?: string | null;
  duzenlenebilir?: boolean;
  cinsiyet?: Cinsiyet | null;
}) {
  const [aktifYuz, setAktifYuz] = useState<VucutYuzu>("on");
  const [gorselYuklendi, setGorselYuklendi] = useState(false);
  const [seciliBolgeKodu, setSeciliBolgeKodu] = useState<string | null>(null);

  const etkinCins = etkinCinsiyet(cinsiyet);
  const cinsiyetBelirtilmemis = !cinsiyet || cinsiyet === "belirtilmemis";

  const { data: isaretler, isLoading, isError, refetch } = useVucutHaritasi(hastaId, seansId, true);
  const kaydetMutasyonu = useVucutIsaretKaydet(hastaId, seansId);
  const kaldirMutasyonu = useVucutIsaretKaldir(hastaId, seansId);

  const aktifYuzIsaretleri = useMemo(
    () => (isaretler ?? []).filter((i) => i.yuz === aktifYuz),
    [isaretler, aktifYuz]
  );
  const isaretByBolge = useMemo(
    () => new Map(aktifYuzIsaretleri.map((i) => [i.bolge, i])),
    [aktifYuzIsaretleri]
  );

  const bolgelerBuYuz = useMemo(
    () => yuzunBolgeleri(etkinCins, aktifYuz),
    [etkinCins, aktifYuz]
  );
  const bolgeMapBuYuz = useMemo(
    () => new Map(bolgelerBuYuz.map((b) => [b.kod, b])),
    [bolgelerBuYuz]
  );
  const seciliIsaret = seciliBolgeKodu ? (isaretByBolge.get(seciliBolgeKodu) ?? null) : null;
  const seciliBolge = seciliBolgeKodu ? bolgeBul(seciliBolgeKodu) : null;

  function yuzDegistir(yuz: VucutYuzu) {
    setAktifYuz(yuz);
    setGorselYuklendi(false);
    setSeciliBolgeKodu(null);
  }

  function bolgeyeTikla(kod: string) {
    if (!duzenlenebilir) return;
    setSeciliBolgeKodu(kod);
  }

  function klavyeIleTikla(e: React.KeyboardEvent<SVGPathElement>, kod: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      bolgeyeTikla(kod);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-1 rounded-lg bg-muted p-1 self-center">
        {(Object.keys(YUZ_ETIKET) as VucutYuzu[]).map((yuz) => (
          <button
            key={yuz}
            type="button"
            aria-pressed={aktifYuz === yuz}
            onClick={() => yuzDegistir(yuz)}
            onMouseEnter={() => gorselPrefetchEt(etkinCins, yuz)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              aktifYuz === yuz
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {YUZ_ETIKET[yuz]}
          </button>
        ))}
      </div>

      {cinsiyetBelirtilmemis && (
        <p className="text-center text-xs text-muted-foreground">
          Cinsiyet bilgisi girilmediği için varsayılan figür gösteriliyor.
        </p>
      )}

      {isError ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 py-10 text-center">
          <p className="text-sm text-destructive">Vücut haritası yüklenemedi.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
            <RotateCcw className="size-3.5" />
            Yeniden dene
          </Button>
        </div>
      ) : (
        <div className="relative mx-auto aspect-[1/2] w-full max-w-[280px] overflow-hidden rounded-xl bg-muted/40">
          {!gorselYuklendi && (
            <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden="true" />
          )}

          <Image
            key={`${etkinCins}-${aktifYuz}`}
            src={figurGorseli(etkinCins, aktifYuz)}
            alt={`Vücut haritası (${YUZ_ETIKET[aktifYuz].toLowerCase()} görünüm)`}
            width={800}
            height={1600}
            priority={false}
            sizes="(min-width: 1024px) 280px, 60vw"
            className="h-full w-full object-contain"
            onLoad={() => setGorselYuklendi(true)}
          />

          {/* İşaret katmanı — sadece görsel geri bildirim, tıklama almaz */}
          <svg
            viewBox="0 0 800 1600"
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ mixBlendMode: "screen" }}
            aria-hidden="true"
          >
            {aktifYuzIsaretleri.map((isaret) => {
              const bolge = bolgeMapBuYuz.get(isaret.bolge);
              if (!bolge) return null;
              const siddet = isaret.severity ?? 5;
              const renk = SIDDET_RENKLERI[siddetBandi(siddet)];
              return (
                <path
                  key={isaret.id}
                  d={bolge.d}
                  fill={renk}
                  fillOpacity={0.26 + siddet * 0.022}
                  stroke={renk}
                  strokeWidth={2.5}
                  className="vucut-glow"
                  style={{ color: renk }}
                />
              );
            })}
          </svg>

          {/* Tıklama katmanı */}
          <svg
            viewBox="0 0 800 1600"
            className={cn("absolute inset-0 h-full w-full", !duzenlenebilir && "cursor-default")}
            role="group"
            aria-label={`Vücut haritası bölgeleri (${YUZ_ETIKET[aktifYuz].toLowerCase()} görünüm)`}
          >
            {bolgelerBuYuz.map((bolge) => (
              <path
                key={bolge.kod}
                d={bolge.d}
                fill="transparent"
                className={cn(duzenlenebilir && "cursor-pointer hover:fill-white/10")}
                role={duzenlenebilir ? "button" : undefined}
                tabIndex={duzenlenebilir ? 0 : undefined}
                aria-label={bolge.ad}
                aria-pressed={duzenlenebilir ? isaretByBolge.has(bolge.kod) : undefined}
                onClick={() => bolgeyeTikla(bolge.kod)}
                onKeyDown={(e) => klavyeIleTikla(e, bolge.kod)}
              >
                <title>
                  {bolge.ad}
                  {isaretByBolge.has(bolge.kod) ? ` · ${isaretByBolge.get(bolge.kod)!.severity ?? "—"}/10` : ""}
                </title>
              </path>
            ))}
          </svg>
        </div>
      )}

      {!isLoading && !isError && (isaretler ?? []).length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          {seansId ? "Bu seansta işaretli bölge yok." : "Henüz işaret yok."}
        </p>
      )}

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        {([1, 2, 3] as const).map((bant) => (
          <span key={bant} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: SIDDET_RENKLERI[bant] }}
              aria-hidden="true"
            />
            {SIDDET_ETIKETLERI[bant]}
          </span>
        ))}
      </div>

      {aktifYuzIsaretleri.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-1.5">
          {aktifYuzIsaretleri.map((isaret) => {
            const bolge = bolgeBul(isaret.bolge);
            const renk = SIDDET_RENKLERI[siddetBandi(isaret.severity ?? 5)];
            return (
              <li key={isaret.id}>
                <span
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                  style={{ borderColor: `${renk}66`, color: renk, backgroundColor: `${renk}1a` }}
                >
                  {bolge?.ad ?? isaret.bolge} · {isaret.severity ?? "—"}
                  {duzenlenebilir && (
                    <button
                      type="button"
                      aria-label={`${bolge?.ad ?? isaret.bolge} işaretini kaldır`}
                      onClick={() => kaldirMutasyonu.mutate(isaret.id)}
                      className="ml-0.5 rounded-full opacity-70 hover:opacity-100"
                    >
                      ×
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {seciliBolgeKodu && seciliBolge && (
        <BolgePopover
          bolgeAdi={seciliBolge.ad}
          mevcutIsaret={seciliIsaret}
          kaydediliyor={kaydetMutasyonu.isPending}
          kaldiriliyor={kaldirMutasyonu.isPending}
          onKapat={() => setSeciliBolgeKodu(null)}
          onKaydet={(siddet, notMetni) => {
            kaydetMutasyonu.mutate({
              id: seciliIsaret?.id,
              bolge: seciliBolgeKodu,
              yuz: aktifYuz,
              severity: siddet,
              not_metni: notMetni,
              randevu_id: seansId,
            });
            setSeciliBolgeKodu(null);
          }}
          onKaldir={
            seciliIsaret
              ? () => {
                  kaldirMutasyonu.mutate(seciliIsaret.id);
                  setSeciliBolgeKodu(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function BolgePopover({
  bolgeAdi,
  mevcutIsaret,
  kaydediliyor,
  kaldiriliyor,
  onKapat,
  onKaydet,
  onKaldir,
}: {
  bolgeAdi: string;
  mevcutIsaret: { severity: number | null; not_metni: string | null } | null;
  kaydediliyor: boolean;
  kaldiriliyor: boolean;
  onKapat: () => void;
  onKaydet: (siddet: number, notMetni: string) => void;
  onKaldir?: () => void;
}) {
  const [siddet, setSiddet] = useState(mevcutIsaret?.severity ?? 5);
  const [notMetni, setNotMetni] = useState(mevcutIsaret?.not_metni ?? "");
  const bant = siddetBandi(siddet);

  return (
    <Dialog open onOpenChange={(acik) => !acik && onKapat()}>
      <DialogContent
        className={cn(
          "fixed inset-x-0 bottom-0 top-auto left-0 max-w-full -translate-x-0 -translate-y-0 rounded-b-none rounded-t-2xl",
          "sm:top-1/2 sm:left-1/2 sm:bottom-auto sm:inset-x-auto sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
        )}
      >
        <DialogHeader>
          <DialogTitle>{bolgeAdi}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Şiddet</span>
              <span className="font-semibold" style={{ color: SIDDET_RENKLERI[bant] }}>
                {SIDDET_ETIKETLERI[bant]} · {siddet}/10
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={siddet}
              onChange={(e) => setSiddet(Number(e.target.value))}
              className="accent-primary"
              style={{ accentColor: SIDDET_RENKLERI[bant] }}
              aria-label="Şiddet (0-10)"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="vucut_isaret_not" className="text-sm text-muted-foreground">
              Not
            </label>
            <textarea
              id="vucut_isaret_not"
              rows={2}
              value={notMetni}
              onChange={(e) => setNotMetni(e.target.value)}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={kaydediliyor || kaldiriliyor}
              onClick={() => onKaydet(siddet, notMetni)}
            >
              {kaydediliyor ? "Kaydediliyor..." : "Kaydet"}
            </Button>
            {onKaldir && (
              <Button type="button" size="sm" variant="destructive" disabled={kaydediliyor || kaldiriliyor} onClick={onKaldir}>
                {kaldiriliyor ? "Kaldırılıyor..." : "Kaldır"}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" disabled={kaydediliyor || kaldiriliyor} onClick={onKapat}>
              Vazgeç
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

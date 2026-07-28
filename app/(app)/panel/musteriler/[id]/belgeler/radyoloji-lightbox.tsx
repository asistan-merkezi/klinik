"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FlipHorizontal, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BELGE_TURU_ETIKETLERI } from "@/types/musteri-belge";
import { VUCUT_BOLGE_ETIKETLERI, type VucutBolgeKodu } from "@/types/musteri-detay";
import type { MusteriBelge } from "@/types/musteri-belge";
import { belgeSignedUrlAl } from "../actions";
import { belgeIndir } from "./actions";
import { watermarkliGorselOlustur, blobIndir } from "@/lib/watermark";

export function RadyolojiLightbox({ belge, onKapat }: { belge: MusteriBelge; onKapat: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [invert, setInvert] = useState(false);
  const [parlaklik, setParlaklik] = useState(100);
  const [kontrast, setKontrast] = useState(100);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const surukleRef = useRef<{ basX: number; basY: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    let iptal = false;
    belgeSignedUrlAl(belge.id).then((sonuc) => {
      if (iptal) return;
      if ("error" in sonuc) setHata(sonuc.error);
      else setUrl(sonuc.url);
    });
    return () => {
      iptal = true;
    };
  }, [belge.id]);

  function sifirla() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setInvert(false);
    setParlaklik(100);
    setKontrast(100);
  }

  async function indir() {
    if (!url) return;
    setIndiriliyor(true);
    try {
      const sonuc = await belgeIndir(belge.id);
      if ("error" in sonuc) throw new Error(sonuc.error);
      const blob = await watermarkliGorselOlustur(
        sonuc.url,
        sonuc.klinikAdi,
        new Date(belge.cekim_tarihi).toLocaleDateString("tr-TR")
      );
      blobIndir(blob, `${BELGE_TURU_ETIKETLERI[belge.belge_turu]}-${belge.cekim_tarihi}.jpg`);
    } catch {
      setHata("İndirilemedi, lütfen tekrar deneyin.");
    } finally {
      setIndiriliyor(false);
    }
  }

  return (
    <Dialog open onOpenChange={(acik) => !acik && onKapat()}>
      <DialogContent className="max-w-4xl" showCloseButton>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <p className="font-medium">
                {BELGE_TURU_ETIKETLERI[belge.belge_turu]}
                {belge.bolge && ` · ${VUCUT_BOLGE_ETIKETLERI[belge.bolge as VucutBolgeKodu] ?? belge.bolge}`}
              </p>
              <p className="text-xs text-muted-foreground">{new Date(belge.cekim_tarihi).toLocaleDateString("tr-TR")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}>
                <Plus className="size-4" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(z - 0.25, 1))}>
                <Minus className="size-4" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setInvert((v) => !v)}>
                <FlipHorizontal className="size-4" />
                <span className="ml-1 hidden sm:inline">Negatif</span>
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={sifirla}>
                <RotateCcw className="size-4" />
              </Button>
              <Button type="button" size="sm" disabled={!url || indiriliyor} onClick={indir}>
                <Download className="size-4" />
                <span className="ml-1 hidden sm:inline">{indiriliyor ? "İndiriliyor..." : "İndir"}</span>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div
              className="relative flex h-[60vh] items-center justify-center overflow-hidden rounded-lg bg-black"
              onMouseDown={(e) => {
                surukleRef.current = { basX: e.clientX, basY: e.clientY, panX: pan.x, panY: pan.y };
              }}
              onMouseMove={(e) => {
                if (!surukleRef.current || e.buttons !== 1) return;
                const { basX, basY, panX, panY } = surukleRef.current;
                setPan({ x: panX + (e.clientX - basX), y: panY + (e.clientY - basY) });
              }}
              onMouseUp={() => {
                surukleRef.current = null;
              }}
              onWheel={(e) => {
                e.preventDefault();
                setZoom((z) => Math.min(Math.max(z - e.deltaY * 0.001, 1), 4));
              }}
            >
              {hata && <p className="text-sm text-destructive">{hata}</p>}
              {!hata && !url && <p className="text-sm text-white/70">Yükleniyor...</p>}
              {url && (
                // eslint-disable-next-line @next/next/no-img-element -- Signed URL, kısa ömürlü
                <img
                  src={url}
                  alt={BELGE_TURU_ETIKETLERI[belge.belge_turu]}
                  className="max-h-full max-w-full cursor-grab select-none active:cursor-grabbing"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    filter: `${invert ? "invert(1) " : ""}brightness(${parlaklik}%) contrast(${kontrast}%)`,
                  }}
                  draggable={false}
                />
              )}
            </div>

            <div className="flex flex-row gap-4 sm:w-40 sm:flex-col">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs text-muted-foreground">Parlaklık</label>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={parlaklik}
                  onChange={(e) => setParlaklik(Number(e.target.value))}
                  className="accent-primary"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-xs text-muted-foreground">Kontrast</label>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={kontrast}
                  onChange={(e) => setKontrast(Number(e.target.value))}
                  className="accent-primary"
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  VUCUT_BOLGE_ETIKETLERI,
  type VucutBolgeKodu,
  type VucutHaritasiIsareti,
} from "@/types/musteri-detay";

const BOLGE_SECENEKLERI = Object.entries(VUCUT_BOLGE_ETIKETLERI).map(([value, label]) => ({
  value,
  label,
}));

function severityRenk(severity: number | null) {
  if (severity == null) return "fill-primary";
  if (severity >= 7) return "fill-destructive";
  if (severity >= 4) return "fill-amber-500";
  return "fill-emerald-500";
}

/**
 * Basit ön-görünüm vücut taslağı üzerinde tıklanan noktayı normalize
 * (0-1) koordinat olarak kaydeder. seans_notu tablosu henüz yok; bu
 * bileşen musteri_vucut_haritasi_isareti tablosuna doğrudan yazar.
 */
export function VucutHaritasi({
  musteriId,
  isaretler,
  duzenlenebilir,
}: {
  musteriId: string;
  isaretler: VucutHaritasiIsareti[];
  duzenlenebilir: boolean;
}) {
  const queryClient = useQueryClient();
  const [yeniNokta, setYeniNokta] = useState<{ x: number; y: number } | null>(null);
  const [seciliIsaret, setSeciliIsaret] = useState<VucutHaritasiIsareti | null>(null);

  const ekleMutasyonu = useMutation({
    mutationFn: async (girdi: { bolge: VucutBolgeKodu; severity: number; not_metni: string; x: number; y: number }) => {
      const supabase = createClient();
      const { error } = await supabase.from("musteri_vucut_haritasi_isareti").insert({
        musteri_id: musteriId,
        bolge: girdi.bolge,
        x: girdi.x,
        y: girdi.y,
        severity: girdi.severity,
        not_metni: girdi.not_metni || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vucut_haritasi", musteriId] });
      setYeniNokta(null);
    },
  });

  function tikla(e: React.MouseEvent<SVGSVGElement>) {
    if (!duzenlenebilir) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setYeniNokta({ x, y });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full max-w-xs self-center overflow-hidden rounded-xl border border-border bg-muted/40">
        <svg
          viewBox="0 0 200 400"
          className={cn("w-full", duzenlenebilir && "cursor-crosshair")}
          onClick={tikla}
          role="img"
          aria-label="Vücut haritası (ön görünüm)"
        >
          {/* Basit ön-görünüm insan silueti */}
          <g fill="none" stroke="currentColor" strokeWidth={1.5} className="text-muted-foreground/50">
            <circle cx="100" cy="35" r="28" />
            <path d="M72 60 Q60 90 55 140 L55 240 Q55 260 65 260 L75 260 L78 160" />
            <path d="M128 60 Q140 90 145 140 L145 240 Q145 260 135 260 L125 260 L122 160" />
            <path d="M72 62 L128 62 Q145 90 148 160 L145 260 L55 260 L52 160 Q55 90 72 62 Z" />
            <path d="M75 258 L70 380 L95 380 L98 265" />
            <path d="M125 258 L130 380 L105 380 L102 265" />
          </g>

          {isaretler.map((isaret) => (
            <circle
              key={isaret.id}
              cx={isaret.x * 200}
              cy={isaret.y * 400}
              r={7}
              className={cn(severityRenk(isaret.severity), "cursor-pointer stroke-white/70")}
              strokeWidth={1.5}
              onClick={(e) => {
                e.stopPropagation();
                setSeciliIsaret(isaret);
              }}
            />
          ))}

          {yeniNokta && (
            <circle cx={yeniNokta.x * 200} cy={yeniNokta.y * 400} r={7} className="fill-primary/60 stroke-primary" strokeWidth={1.5} />
          )}
        </svg>
      </div>

      {!duzenlenebilir && isaretler.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">Henüz işaret yok.</p>
      )}
      {duzenlenebilir && (
        <p className="text-center text-xs text-muted-foreground">
          Yeni işaret eklemek için harita üzerine tıklayın.
        </p>
      )}

      {yeniNokta && (
        <IsaretEkleModal
          acik
          onOpenChange={(acik) => !acik && setYeniNokta(null)}
          onKaydet={(girdi) => ekleMutasyonu.mutate({ ...girdi, x: yeniNokta.x, y: yeniNokta.y })}
          kaydediliyor={ekleMutasyonu.isPending}
          hata={ekleMutasyonu.isError}
        />
      )}

      {seciliIsaret && (
        <Dialog open onOpenChange={(acik) => !acik && setSeciliIsaret(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{VUCUT_BOLGE_ETIKETLERI[seciliIsaret.bolge as VucutBolgeKodu] ?? seciliIsaret.bolge}</DialogTitle>
            </DialogHeader>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Şiddet</dt>
                <dd>{seciliIsaret.severity ?? "—"}/10</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tarih</dt>
                <dd>{new Date(seciliIsaret.created_at).toLocaleDateString("tr-TR")}</dd>
              </div>
              {seciliIsaret.not_metni && (
                <div>
                  <dt className="text-muted-foreground">Not</dt>
                  <dd>{seciliIsaret.not_metni}</dd>
                </div>
              )}
            </dl>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function IsaretEkleModal({
  acik,
  onOpenChange,
  onKaydet,
  kaydediliyor,
  hata,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  onKaydet: (girdi: { bolge: VucutBolgeKodu; severity: number; not_metni: string }) => void;
  kaydediliyor: boolean;
  hata: boolean;
}) {
  const [bolge, setBolge] = useState<VucutBolgeKodu>("bel");
  const [severity, setSeverity] = useState(5);
  const [notMetni, setNotMetni] = useState("");

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vücut Haritası İşareti Ekle</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="isaret_bolge">Bölge</Label>
            <Select value={bolge} onValueChange={(v) => setBolge(v as VucutBolgeKodu)} items={BOLGE_SECENEKLERI}>
              <SelectTrigger id="isaret_bolge" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOLGE_SECENEKLERI.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="isaret_severity">Şiddet (0-10)</Label>
            <input
              id="isaret_severity"
              type="range"
              min={0}
              max={10}
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
              className="accent-primary"
            />
            <span className="text-sm text-muted-foreground">{severity}/10</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="isaret_not">Not</Label>
            <textarea
              id="isaret_not"
              rows={2}
              value={notMetni}
              onChange={(e) => setNotMetni(e.target.value)}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          {hata && <p className="text-sm text-destructive">Kaydedilemedi, lütfen tekrar deneyin.</p>}
          <Button
            type="button"
            disabled={kaydediliyor}
            onClick={() => onKaydet({ bolge, severity, not_metni: notMetni })}
            className="w-fit"
          >
            {kaydediliyor ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

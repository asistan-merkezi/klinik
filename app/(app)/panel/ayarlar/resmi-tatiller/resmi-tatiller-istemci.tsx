"use client";

import { useActionState, useState, useTransition } from "react";
import { CirclePlus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bayramOnerisiKarar, onerileriKontrolEt, tatilEkle, tatilSil } from "./actions";

type Sonuc = { success: boolean; message: string } | null;

function SonucMesaji({ sonuc }: { sonuc: Sonuc }) {
  if (!sonuc) return null;
  return (
    <p role="status" className={sonuc.success ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
      {sonuc.message}
    </p>
  );
}

/** Bir bayramın bekleyen önerisi: tarihler düzeltilebilir, sonra Onayla / Reddet. */
export function BayramOnerisiKarti({
  yil,
  bayram,
  baslik,
  gunler,
}: {
  yil: number;
  bayram: "ramazan" | "kurban";
  baslik: string;
  gunler: { tarih: string; ad: string }[];
}) {
  const [sonuc, formAction, isPending] = useActionState(bayramOnerisiKarar, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <input type="hidden" name="yil" value={yil} />
      <input type="hidden" name="bayram" value={bayram} />
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-semibold">
          {baslik} {yil}
        </h3>
        <p className="text-sm text-muted-foreground">
          Önerilen tarihler hesaplanmış takvimden gelir ve Diyanet&apos;in açıkladığı tarihten bir gün sapabilir.
          Onaylamadan önce Diyanet takvimiyle karşılaştırın; gerekirse günleri düzeltin.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {gunler.map((g, i) => (
          <div key={g.tarih} className="flex flex-col gap-1">
            <Label htmlFor={`${bayram}-${yil}-${i}`}>{i + 1}. gün</Label>
            <Input
              id={`${bayram}-${yil}-${i}`}
              type="date"
              name="tarih"
              defaultValue={g.tarih}
              min={`${yil}-01-01`}
              max={`${yil}-12-31`}
              required
              disabled={isPending}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="karar" value="onayla" disabled={isPending}>
          Onayla
        </Button>
        <Button type="submit" name="karar" value="reddet" variant="outline" disabled={isPending}>
          Reddet, elle gireceğim
        </Button>
      </div>
      <SonucMesaji sonuc={sonuc} />
    </form>
  );
}

export function TatilEkleFormu({ varsayilanTarih }: { varsayilanTarih: string }) {
  const [acik, setAcik] = useState(false);
  const [sonuc, formAction, isPending] = useActionState(tatilEkle, null);
  const [gorulenSonuc, setGorulenSonuc] = useState(sonuc);

  if (sonuc !== gorulenSonuc) {
    setGorulenSonuc(sonuc);
    if (sonuc?.success) setAcik(false);
  }

  if (!acik) {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" className="w-fit" onClick={() => setAcik(true)}>
          <CirclePlus /> Kliniğe Özel Tatil Ekle
        </Button>
        <SonucMesaji sonuc={sonuc} />
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tatil-tarih">Tarih</Label>
          <Input id="tatil-tarih" type="date" name="tarih" defaultValue={varsayilanTarih} required disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tatil-ad">Ad</Label>
          <Input
            id="tatil-ad"
            name="ad"
            placeholder="Örn. Ramazan Bayramı (1. gün) veya Bayram idari izni"
            required
            disabled={isPending}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Ekleniyor..." : "Ekle"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => setAcik(false)}>
          Vazgeç
        </Button>
      </div>
      <SonucMesaji sonuc={sonuc} />
    </form>
  );
}

export function TatilSilDugmesi({ id }: { id: string }) {
  const [onay, setOnay] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (onay) {
    return (
      <span className="flex items-center justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const s = await tatilSil(id);
              setHata(s && !s.success ? s.message : null);
              setOnay(false);
            })
          }
        >
          Sil
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setOnay(false)}>
          Vazgeç
        </Button>
      </span>
    );
  }
  return (
    <span className="flex items-center justify-end gap-1.5">
      {hata && <span className="text-xs text-destructive">{hata}</span>}
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Tatili sil" onClick={() => setOnay(true)}>
        <Trash2 />
      </Button>
    </span>
  );
}

export function KontrolEtDugmesi() {
  const [sonuc, setSonuc] = useState<Sonuc>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(async () => setSonuc(await onerileriKontrolEt()))}
      >
        <RefreshCw className={isPending ? "animate-spin" : undefined} /> Şimdi Kontrol Et
      </Button>
      <SonucMesaji sonuc={sonuc} />
    </div>
  );
}

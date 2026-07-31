"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SecenekSatir } from "@/types/randevu";
import { AdimEditor, bosAdim, type Adim } from "./adim-editor";

function textAlaniSinifi() {
  return cn(
    "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
  );
}

type SonucDurumu = { success: boolean; message: string } | null;

export function ProtokolFormu({
  tedaviler,
  action,
  gonderButonEtiketi,
  baslangicAd,
  baslangicAciklama,
  baslangicAdimlar,
  basariliOlunca,
}: {
  tedaviler: SecenekSatir[];
  action: (onceki: SonucDurumu, formData: FormData) => Promise<SonucDurumu>;
  gonderButonEtiketi: string;
  baslangicAd?: string;
  baslangicAciklama?: string;
  baslangicAdimlar?: Adim[];
  basariliOlunca?: () => void;
}) {
  const idOnEki = useId();
  const [durum, formAction, isPending] = useActionState(action, null);
  const [ad, setAd] = useState(baslangicAd ?? "");
  const [aciklama, setAciklama] = useState(baslangicAciklama ?? "");
  const [adimlar, setAdimlar] = useState<Adim[]>(
    baslangicAdimlar && baslangicAdimlar.length > 0 ? baslangicAdimlar : [bosAdim(`${idOnEki}-0`)]
  );
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      basariliOlunca?.();
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idOnEki}-ad`}>Protokol Adı</Label>
        <Input
          id={`${idOnEki}-ad`}
          name="ad"
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          required
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
        <textarea
          id={`${idOnEki}-aciklama`}
          name="aciklama"
          value={aciklama}
          onChange={(e) => setAciklama(e.target.value)}
          disabled={isPending}
          rows={2}
          className={textAlaniSinifi()}
        />
      </div>

      <AdimEditor
        tedaviler={tedaviler}
        adimlar={adimlar}
        onAdimlarDegisti={setAdimlar}
        disabled={isPending}
      />

      {durum && (
        <p
          role="alert"
          className={`text-sm ${durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
        >
          {durum.message}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Kaydediliyor..." : gonderButonEtiketi}
      </Button>
    </form>
  );
}

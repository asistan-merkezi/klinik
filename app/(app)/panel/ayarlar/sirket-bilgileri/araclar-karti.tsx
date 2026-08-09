"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CirclePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KlinikArac } from "@/types/klinik";
import { aracEkle, aracSil } from "./actions";

function AracSatiri({ arac, duzenlenebilir }: { arac: KlinikArac; duzenlenebilir: boolean }) {
  const [silinsinMi, setSilinsinMi] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="truncate">
        <span className="font-medium">
          {arac.marka} {arac.model}
        </span>
        <span className="ml-2 text-muted-foreground">{arac.plaka}</span>
      </span>

      {duzenlenebilir &&
        (silinsinMi ? (
          <span className="flex shrink-0 items-center gap-2 text-xs">
            <span className="text-muted-foreground">Silinsin mi?</span>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(() => {
                  void aracSil(arac.id);
                })
              }
              className="rounded px-1.5 py-0.5 text-destructive hover:bg-destructive/10"
            >
              Evet, sil
            </button>
            <button
              type="button"
              onClick={() => setSilinsinMi(false)}
              className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted"
            >
              Vazgeç
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setSilinsinMi(true)}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            aria-label="Aracı sil"
          >
            <Trash2 className="size-3.5" />
          </button>
        ))}
    </li>
  );
}

export function AraclarKarti({ araclar, duzenlenebilir }: { araclar: KlinikArac[]; duzenlenebilir: boolean }) {
  const [sonuc, formAction, isPending] = useActionState(aracEkle, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (sonuc?.success) {
      formRef.current?.reset();
    }
  }, [sonuc]);

  return (
    <div className="flex flex-col gap-4">
      {araclar.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kayıtlı araç yok.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {araclar.map((arac) => (
            <AracSatiri key={arac.id} arac={arac} duzenlenebilir={duzenlenebilir} />
          ))}
        </ul>
      )}

      {duzenlenebilir && (
        <form
          ref={formRef}
          action={formAction}
          className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"
        >
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="marka" className="text-xs text-muted-foreground">
              Marka
            </label>
            <Input id="marka" name="marka" required disabled={isPending} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="model" className="text-xs text-muted-foreground">
              Model
            </label>
            <Input id="model" name="model" required disabled={isPending} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="plaka" className="text-xs text-muted-foreground">
              Plaka
            </label>
            <Input id="plaka" name="plaka" required disabled={isPending} />
          </div>
          <Button type="submit" disabled={isPending} className="w-fit shrink-0">
            <CirclePlus /> {isPending ? "Ekleniyor..." : "Araç Ekle"}
          </Button>
        </form>
      )}

      {sonuc && !sonuc.success && (
        <p role="alert" className="text-sm text-destructive">
          {sonuc.message}
        </p>
      )}
    </div>
  );
}

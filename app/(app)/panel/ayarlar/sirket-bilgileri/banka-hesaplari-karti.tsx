"use client";

import { useActionState, useState, useTransition } from "react";
import { CirclePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KlinikBankaHesabiDetay } from "@/types/klinik";
import { bankaHesabiEkle, bankaHesabiSil } from "./actions";

function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function BankaHesabiSatiri({ hesap, duzenlenebilir }: { hesap: KlinikBankaHesabiDetay; duzenlenebilir: boolean }) {
  const [silinsinMi, setSilinsinMi] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="truncate">
        <span className="font-medium">
          {hesap.banka_adi}
          {hesap.sube ? ` — ${hesap.sube}` : ""}
        </span>
        <span className="ml-2 text-muted-foreground">{hesap.hesap_sahibi}</span>
        <span className="ml-2 font-mono text-xs tracking-wide text-muted-foreground">{formatIban(hesap.iban)}</span>
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
                  void bankaHesabiSil(hesap.id);
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
            aria-label="Banka hesabını sil"
          >
            <Trash2 className="size-3.5" />
          </button>
        ))}
    </li>
  );
}

export function BankaHesaplariKarti({
  bankaHesaplari,
  duzenlenebilir,
}: {
  bankaHesaplari: KlinikBankaHesabiDetay[];
  duzenlenebilir: boolean;
}) {
  const [sonuc, formAction, isPending] = useActionState(bankaHesabiEkle, null);
  const [formKey, setFormKey] = useState(0);
  const [gorulenSonuc, setGorulenSonuc] = useState(sonuc);

  if (sonuc !== gorulenSonuc) {
    setGorulenSonuc(sonuc);
    if (sonuc?.success) setFormKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      {bankaHesaplari.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kayıtlı banka hesabı yok.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {bankaHesaplari.map((hesap) => (
            <BankaHesabiSatiri key={hesap.id} hesap={hesap} duzenlenebilir={duzenlenebilir} />
          ))}
        </ul>
      )}

      {duzenlenebilir && (
        <form key={formKey} action={formAction} className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="banka_adi" className="text-xs text-muted-foreground">
                Banka Adı
              </label>
              <Input id="banka_adi" name="banka_adi" required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sube" className="text-xs text-muted-foreground">
                Şube (opsiyonel)
              </label>
              <Input id="sube" name="sube" disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="hesap_sahibi" className="text-xs text-muted-foreground">
                Hesap Sahibi
              </label>
              <Input id="hesap_sahibi" name="hesap_sahibi" required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="iban" className="text-xs text-muted-foreground">
                IBAN
              </label>
              <Input id="iban" name="iban" required disabled={isPending} className="font-mono tracking-wide" />
            </div>
          </div>
          <Button type="submit" disabled={isPending} className="w-fit shrink-0">
            <CirclePlus /> {isPending ? "Ekleniyor..." : "Banka Hesabı Ekle"}
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

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { OdemeFormu } from "./odeme-formu";

export type TakipSatiri = {
  id: string;
  ad_soyad: string;
  gorev: string;
  aktif: boolean;
  hakedis: number;
  odenen: number;
};

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function PersonelTakipListesi({ satirlar }: { satirlar: TakipSatiri[] }) {
  const [arama, setArama] = useState("");
  const [odemeAcikId, setOdemeAcikId] = useState<string | null>(null);

  const gruplar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    const filtrelenmis = satirlar.filter(
      (s) => !q || s.ad_soyad.toLocaleLowerCase("tr").includes(q) || s.gorev.toLocaleLowerCase("tr").includes(q)
    );

    const map = new Map<string, TakipSatiri[]>();
    for (const s of filtrelenmis) {
      const liste = map.get(s.gorev) ?? [];
      liste.push(s);
      map.set(s.gorev, liste);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([gorev, liste]) => ({
        gorev,
        liste: liste.sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, "tr")),
      }));
  }, [satirlar, arama]);

  const odemeAcikSatir = satirlar.find((s) => s.id === odemeAcikId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <Input
        type="search"
        placeholder="İsim veya görev ile ara"
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        className="max-w-sm"
      />

      {gruplar.length === 0 && (
        <p className="text-sm text-muted-foreground">Aramayla eşleşen personel bulunamadı.</p>
      )}

      {gruplar.map(({ gorev, liste }) => (
        <div key={gorev} className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {gorev}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {liste.map((s) => {
              const kalan = s.hakedis - s.odenen;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                  <Link href={`/panel/personel/${s.id}`} className="flex min-w-0 flex-col hover:underline">
                    <span className={cn("truncate font-medium", !s.aktif && "text-muted-foreground line-through")}>
                      {s.ad_soyad}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Hakediş {paraFormat(s.hakedis)} · Ödenen {paraFormat(s.odenen)}
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        kalan > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                      )}
                    >
                      {paraFormat(kalan)}
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setOdemeAcikId(s.id)}>
                      Ödeme Ekle
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <Dialog open={odemeAcikSatir != null} onOpenChange={(acik) => !acik && setOdemeAcikId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{odemeAcikSatir?.ad_soyad} — Ödeme Kaydet</DialogTitle>
          </DialogHeader>
          {odemeAcikSatir && <OdemeFormu personelId={odemeAcikSatir.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { OdemeFormu } from "./odeme-formu";
import { TakipSatiriKart } from "./takip-satiri";

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

    let sira = 0;
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([gorev, liste]) => ({
        gorev,
        liste: liste
          .sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, "tr"))
          .map((satir) => ({ satir, sira: sira++ })),
      }));
  }, [satirlar, arama]);

  const odemeAcikSatir = satirlar.find((s) => s.id === odemeAcikId) ?? null;

  function grupToplami(liste: { satir: TakipSatiri }[]) {
    return liste.reduce(
      (acc, { satir: s }) => {
        acc.hakedis += s.hakedis;
        acc.odenen += s.odenen;
        return acc;
      },
      { hakedis: 0, odenen: 0 }
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="İsim veya görev ile ara"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          className="h-11 pl-8 focus-visible:ring-ring/50"
        />
      </div>

      {gruplar.length === 0 && (
        <p className="text-sm text-muted-foreground">Aramayla eşleşen personel bulunamadı.</p>
      )}

      {gruplar.map(({ gorev, liste }) => {
        const toplam = grupToplami(liste);
        const kalanToplam = toplam.hakedis - toplam.odenen;

        return (
          <div key={gorev} className="flex flex-col gap-2">
            <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {gorev}
            </h2>
            <ul className="flex flex-col gap-2">
              {liste.map(({ satir, sira }) => (
                <TakipSatiriKart
                  key={satir.id}
                  satir={satir}
                  gecikme={sira * 40}
                  onOdemeEkle={() => setOdemeAcikId(satir.id)}
                />
              ))}
            </ul>
            <p className="px-1 text-xs text-muted-foreground">
              Grup toplamı: Hakediş {paraFormat(toplam.hakedis)} − Ödenen {paraFormat(toplam.odenen)} ={" "}
              <span
                className={cn(
                  "font-semibold",
                  kalanToplam > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                )}
              >
                {paraFormat(kalanToplam)}
              </span>
            </p>
          </div>
        );
      })}

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

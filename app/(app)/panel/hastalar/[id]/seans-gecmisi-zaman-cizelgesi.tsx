"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { bolgeBul } from "@/lib/vucut-bolgeleri";
import { RANDEVU_DURUM_ETIKETLERI, type RandevuDurumu } from "@/types/hasta-detay";
import { useHastaSeansGecmisi, useHastaProtokoller, useVucutHaritasi } from "./queries";

const TARIH_SAAT_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DURUM_SINIFLARI: Record<RandevuDurumu, string> = {
  planlandi: "bg-primary/10 text-primary",
  geldi: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  gecikmeli_geldi: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  iptal: "bg-destructive/10 text-destructive",
  gelmedi: "bg-destructive/10 text-destructive",
  ertelendi: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

export function SeansGecmisiZamanCizelgesi({
  hastaId,
  aktif,
  seciliSeansId,
  onSeansSec,
}: {
  hastaId: string;
  aktif: boolean;
  seciliSeansId: string | null;
  onSeansSec: (id: string | null) => void;
}) {
  const { data: seanslar, isLoading } = useHastaSeansGecmisi(hastaId, aktif);
  const { data: tumIsaretler } = useVucutHaritasi(hastaId, null, aktif);
  const { data: protokoller } = useHastaProtokoller(hastaId, aktif);

  const isaretlerBySeans = useMemo(() => {
    const harita = new Map<string, string[]>();
    for (const isaret of tumIsaretler ?? []) {
      if (!isaret.randevu_id) continue;
      const bolgeAdi = bolgeBul(isaret.bolge)?.ad ?? isaret.bolge;
      const liste = harita.get(isaret.randevu_id) ?? [];
      liste.push(bolgeAdi);
      harita.set(isaret.randevu_id, liste);
    }
    return harita;
  }, [tumIsaretler]);

  const aktifProtokolEtiketleri = (protokoller ?? [])
    .filter((p) => p.durum === "aktif")
    .map((p) => p.islem_tanimi?.ad)
    .filter((ad): ad is string => Boolean(ad));

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Yükleniyor...</p>;
  }

  if (!seanslar || seanslar.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
        Henüz geçmiş seans yok.
      </div>
    );
  }

  return (
    <ol className="relative flex flex-col gap-3 border-l border-border pl-6">
      {seanslar.map((seans) => {
        const secili = seans.id === seciliSeansId;
        const bolgeEtiketleri = isaretlerBySeans.get(seans.id) ?? [];

        return (
          <li key={seans.id} className="relative">
            <span
              className={cn(
                "absolute -left-[27px] top-4 size-3 rounded-full border-2 border-background",
                secili ? "bg-primary" : "bg-muted-foreground/40"
              )}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => onSeansSec(secili ? null : seans.id)}
              className={cn(
                "flex w-full flex-col gap-2 rounded-xl border p-3.5 text-left transition-all",
                secili
                  ? "border-primary bg-primary/5 shadow-[0_0_0_1px_var(--primary),0_4px_20px_-6px_var(--primary)]"
                  : "border-border hover:bg-muted/40"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{TARIH_SAAT_FORMAT.format(new Date(seans.baslangic))}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", DURUM_SINIFLARI[seans.durum])}>
                  {RANDEVU_DURUM_ETIKETLERI[seans.durum]}
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                {seans.terapist?.personel?.ad_soyad ?? "Terapist atanmamış"}
              </p>

              {(aktifProtokolEtiketleri.length > 0 || bolgeEtiketleri.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  {aktifProtokolEtiketleri.map((ad) => (
                    <span key={ad} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {ad}
                    </span>
                  ))}
                  {bolgeEtiketleri.map((ad, i) => (
                    <span key={`${ad}-${i}`} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {ad}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

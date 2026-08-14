"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { HastaKarsilastirma } from "@/types/hasta-detay";
import { belgeSignedUrlAl } from "./actions";

const ASAMA_ETIKETLERI: Record<NonNullable<HastaKarsilastirma["asama"]>, string> = {
  tedavi_oncesi: "Tedavi Öncesi",
  ara_kontrol: "Ara Kontrol",
  tedavi_sonrasi: "Tedavi Sonrası",
};

export function KarsilastirmaGalerisi({ kayitlar }: { kayitlar: HastaKarsilastirma[] }) {
  const [acikGorsel, setAcikGorsel] = useState<string | null>(null);

  const gorselAcMutasyonu = useMutation({
    mutationFn: async (belgeId: string) => {
      const sonuc = await belgeSignedUrlAl(belgeId);
      if ("error" in sonuc) throw new Error(sonuc.error);
      return sonuc.url;
    },
    onSuccess: (url) => setAcikGorsel(url),
  });

  if (kayitlar.length === 0) {
    return <EmptyState icon={Images} title="Henüz önce/sonra fotoğrafı yok." compact />;
  }

  const gruplar = new Map<string, HastaKarsilastirma[]>();
  for (const k of kayitlar) {
    const liste = gruplar.get(k.karsilastirma_grubu_id) ?? [];
    liste.push(k);
    gruplar.set(k.karsilastirma_grubu_id, liste);
  }

  return (
    <div className="flex flex-col gap-4">
      {Array.from(gruplar.entries()).map(([grupId, kayitlar]) => (
        <div key={grupId} className="grid gap-2 sm:grid-cols-3">
          {kayitlar.map((k) => (
            <button
              key={k.belge_id}
              type="button"
              disabled={gorselAcMutasyonu.isPending}
              onClick={() => gorselAcMutasyonu.mutate(k.belge_id)}
              className="flex flex-col gap-1 rounded-lg border border-border p-2 text-left transition-colors hover:border-primary"
            >
              <div className="flex aspect-square items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                Fotoğrafı Göster
              </div>
              <span className="text-xs font-medium">{k.asama ? ASAMA_ETIKETLERI[k.asama] : "—"}</span>
              <span className="text-xs text-muted-foreground">{new Date(k.cekim_tarihi).toLocaleDateString("tr-TR")}</span>
            </button>
          ))}
        </div>
      ))}

      {gorselAcMutasyonu.isError && (
        <p className="text-sm text-destructive">Görüntülenemedi, lütfen tekrar deneyin.</p>
      )}

      <Dialog open={acikGorsel != null} onOpenChange={(acik) => !acik && setAcikGorsel(null)}>
        <DialogContent className="max-w-2xl">
          {acikGorsel && (
            // eslint-disable-next-line @next/next/no-img-element -- Signed URL, Next Image optimizer'a gerek yok, 5dk geçerli
            <img src={acikGorsel} alt="Karşılaştırma fotoğrafı" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled
        title="Belgeler & Medya sekmesi tamamlandığında etkinleşecek"
      >
        + Karşılaştırma Fotoğrafı Ekle
      </Button>
    </div>
  );
}

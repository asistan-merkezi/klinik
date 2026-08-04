"use client";

import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BELGE_ASAMA_ETIKETLERI, BELGE_TURU_ETIKETLERI, type HastaBelge } from "@/types/hasta-belge";
import { VUCUT_BOLGE_ETIKETLERI } from "@/lib/vucut-bolgeleri";
import { useSignedThumbnail } from "./use-signed-thumbnail";

/**
 * Bu turda temel grup kartları gösterilir (kullanıcı onayıyla). Önce/sonra
 * sürüklenebilir slider ve 3+ kayıtlı zaman çizelgesi şeridi ikinci adımda
 * eklenecek — bkz. görev notu.
 */
export function KlinikFotoGrid({
  belgeler,
  onYukle,
}: {
  belgeler: HastaBelge[];
  onYukle: () => void;
}) {
  if (belgeler.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        title="Henüz klinik fotoğraf yok"
        description="Postür veya bölgesel fotoğraf yükleyin."
        action={
          <Button type="button" size="sm" onClick={onYukle}>
            + Yükle
          </Button>
        }
      />
    );
  }

  const gruplar = new Map<string, HastaBelge[]>();
  for (const b of belgeler) {
    const anahtar = b.karsilastirma_grubu_id ?? b.id;
    const liste = gruplar.get(anahtar) ?? [];
    liste.push(b);
    gruplar.set(anahtar, liste);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Önce/sonra karşılaştırma slider&apos;ı ve zaman çizelgesi yakında eklenecek — şimdilik gruplar liste halinde.
      </p>
      {Array.from(gruplar.entries()).map(([grupId, kayitlar]) => (
        <div key={grupId} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {kayitlar.map((b) => (
            <KlinikFotoKarti key={b.id} belge={b} />
          ))}
        </div>
      ))}
    </div>
  );
}

function KlinikFotoKarti({ belge }: { belge: HastaBelge }) {
  const { url } = useSignedThumbnail(belge);

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border p-2">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Signed URL, kısa ömürlü
          <img src={url} alt={BELGE_TURU_ETIKETLERI[belge.belge_turu]} className="h-full w-full object-cover" />
        ) : (
          <div className="size-6 animate-pulse rounded-full bg-muted-foreground/20" />
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5 text-xs">
        <span className="font-medium">
          {belge.asama ? BELGE_ASAMA_ETIKETLERI[belge.asama] : BELGE_TURU_ETIKETLERI[belge.belge_turu]}
        </span>
        <span className="text-muted-foreground">
          {belge.bolge && `${VUCUT_BOLGE_ETIKETLERI[belge.bolge] ?? belge.bolge} · `}
          {new Date(belge.cekim_tarihi).toLocaleDateString("tr-TR")}
        </span>
      </div>
    </div>
  );
}

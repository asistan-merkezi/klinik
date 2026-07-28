"use client";

import { Button } from "@/components/ui/button";
import { BELGE_ASAMA_ETIKETLERI, BELGE_TURU_ETIKETLERI, type MusteriBelge } from "@/types/musteri-belge";
import { VUCUT_BOLGE_ETIKETLERI, type VucutBolgeKodu } from "@/types/musteri-detay";
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
  belgeler: MusteriBelge[];
  onYukle: () => void;
}) {
  if (belgeler.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
        <p className="text-sm font-medium">Henüz klinik fotoğraf yok</p>
        <p className="text-sm text-muted-foreground">Postür veya bölgesel fotoğraf yükleyin.</p>
        <Button type="button" size="sm" onClick={onYukle} className="mt-1">
          + Yükle
        </Button>
      </div>
    );
  }

  const gruplar = new Map<string, MusteriBelge[]>();
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

function KlinikFotoKarti({ belge }: { belge: MusteriBelge }) {
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
          {belge.bolge && `${VUCUT_BOLGE_ETIKETLERI[belge.bolge as VucutBolgeKodu] ?? belge.bolge} · `}
          {new Date(belge.cekim_tarihi).toLocaleDateString("tr-TR")}
        </span>
      </div>
    </div>
  );
}

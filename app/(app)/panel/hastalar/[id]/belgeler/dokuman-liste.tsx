"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { BELGE_TURU_ETIKETLERI, type HastaBelge } from "@/types/hasta-belge";
import { belgeIndir } from "./actions";
import { blobIndir } from "@/lib/watermark";

/**
 * Bu turda liste görünümü (kullanıcı onayıyla). PDF inline önizleme ve
 * versiyon geçmişi paneli ikinci adımda eklenecek — bkz. görev notu.
 */
export function DokumanListe({ belgeler, onYukle }: { belgeler: HastaBelge[]; onYukle: () => void }) {
  if (belgeler.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Henüz doküman yok"
        description="Reçete, sevk veya epikriz yükleyin."
        action={
          <Button type="button" size="sm" onClick={onYukle}>
            + Yükle
          </Button>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {belgeler.map((b) => (
        <DokumanSatiri key={b.id} belge={b} />
      ))}
    </ul>
  );
}

function DokumanSatiri({ belge }: { belge: HastaBelge }) {
  const [indiriliyor, setIndiriliyor] = useState(false);

  async function indir() {
    setIndiriliyor(true);
    const sonuc = await belgeIndir(belge.id);
    setIndiriliyor(false);
    if (!("error" in sonuc)) {
      const dosya = await fetch(sonuc.url).then((r) => r.blob());
      blobIndir(dosya, `${BELGE_TURU_ETIKETLERI[belge.belge_turu]}-${belge.cekim_tarihi}.pdf`);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div className="flex items-center gap-2.5">
        <FileText className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col">
          <span className="font-medium">
            {BELGE_TURU_ETIKETLERI[belge.belge_turu]}
            {belge.is_guncel && (
              <StatusBadge tone="emerald" className="ml-2">
                En Güncel
              </StatusBadge>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{new Date(belge.cekim_tarihi).toLocaleDateString("tr-TR")}</span>
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={indiriliyor} onClick={indir}>
        <Download className="size-4" />
      </Button>
    </li>
  );
}

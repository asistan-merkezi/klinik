"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BELGE_TURU_ETIKETLERI, type HastaBelge } from "@/types/hasta-belge";
import { VUCUT_BOLGE_ETIKETLERI } from "@/lib/vucut-bolgeleri";
import { useSignedThumbnail } from "./use-signed-thumbnail";
import { belgeSil, belgeKaliciSil } from "./actions";
import { RadyolojiLightbox } from "./radyoloji-lightbox";

export function RadyolojiGrid({
  belgeler,
  hastaId,
  rol,
  onYukle,
}: {
  belgeler: HastaBelge[];
  hastaId: string;
  rol: string | null;
  onYukle: () => void;
}) {
  const [acikBelge, setAcikBelge] = useState<HastaBelge | null>(null);

  if (belgeler.length === 0) {
    return (
      <EmptyState
        icon={ScanLine}
        title="Henüz radyoloji görüntüsü yok"
        description="Röntgen, MR, tomografi veya ultrason yükleyin."
        action={
          <Button type="button" size="sm" onClick={onYukle}>
            + Yükle
          </Button>
        }
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {belgeler.map((b) => (
          <RadyolojiKarti
            key={b.id}
            belge={b}
            hastaId={hastaId}
            rol={rol}
            onAc={() => setAcikBelge(b)}
          />
        ))}
      </div>

      {acikBelge && <RadyolojiLightbox belge={acikBelge} onKapat={() => setAcikBelge(null)} />}
    </>
  );
}

function RadyolojiKarti({
  belge,
  hastaId,
  rol,
  onAc,
}: {
  belge: HastaBelge;
  hastaId: string;
  rol: string | null;
  onAc: () => void;
}) {
  const queryClient = useQueryClient();
  const { url: thumbUrl } = useSignedThumbnail(belge);
  const [silinsinMi, setSilinsinMi] = useState(false);
  const [silmePending, setSilmePending] = useState(false);
  const silinebilirMi = rol === "klinik_admin" || rol === "resepsiyon";

  async function sil(kalici: boolean) {
    setSilmePending(true);
    const sonuc = kalici ? await belgeKaliciSil(belge.id, hastaId) : await belgeSil(belge.id, hastaId);
    setSilmePending(false);
    if (!("error" in sonuc)) {
      queryClient.invalidateQueries({ queryKey: ["hasta_belge", hastaId, "radyoloji"] });
    }
    setSilinsinMi(false);
  }

  return (
    <div className="group relative flex flex-col gap-1.5 rounded-xl border border-border p-2">
      <button
        type="button"
        onClick={onAc}
        className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted"
      >
        {belge.dosya_mime === "application/pdf" ? (
          <FileText className="size-8 text-muted-foreground" />
        ) : thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Signed URL, kısa ömürlü
          <img src={thumbUrl} alt={BELGE_TURU_ETIKETLERI[belge.belge_turu]} className="h-full w-full object-cover" />
        ) : (
          <div className="size-6 animate-pulse rounded-full bg-muted-foreground/20" />
        )}
      </button>

      <div className="flex flex-col gap-0.5 px-0.5 text-xs">
        <span className="font-medium">{BELGE_TURU_ETIKETLERI[belge.belge_turu]}</span>
        <span className="text-muted-foreground">
          {belge.bolge && `${VUCUT_BOLGE_ETIKETLERI[belge.bolge] ?? belge.bolge} · `}
          {new Date(belge.cekim_tarihi).toLocaleDateString("tr-TR")}
        </span>
      </div>

      {silinebilirMi && (
        <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100">
          {!silinsinMi ? (
            <button
              type="button"
              onClick={() => setSilinsinMi(true)}
              className="rounded-md bg-black/60 p-1 text-white hover:bg-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : (
            <div className="flex flex-col gap-1 rounded-md bg-popover p-1.5 text-[11px] shadow-md ring-1 ring-foreground/10">
              <button type="button" disabled={silmePending} onClick={() => sil(false)} className="rounded px-1.5 py-0.5 text-left hover:bg-muted">
                Sil
              </button>
              {rol === "klinik_admin" && (
                <button
                  type="button"
                  disabled={silmePending}
                  onClick={() => sil(true)}
                  className="rounded px-1.5 py-0.5 text-left text-destructive hover:bg-destructive/10"
                >
                  Kalıcı sil
                </button>
              )}
              <button type="button" onClick={() => setSilinsinMi(false)} className="rounded px-1.5 py-0.5 text-left text-muted-foreground hover:bg-muted">
                Vazgeç
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

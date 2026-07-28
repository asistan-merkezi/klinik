"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BELGE_TURU_ETIKETLERI, type MusteriBelge } from "@/types/musteri-belge";
import { VUCUT_BOLGE_ETIKETLERI, type VucutBolgeKodu } from "@/types/musteri-detay";
import { useSignedThumbnail } from "./use-signed-thumbnail";
import { belgeSil, belgeKaliciSil } from "./actions";
import { RadyolojiLightbox } from "./radyoloji-lightbox";

export function RadyolojiGrid({
  belgeler,
  musteriId,
  rol,
  onYukle,
}: {
  belgeler: MusteriBelge[];
  musteriId: string;
  rol: string | null;
  onYukle: () => void;
}) {
  const [acikBelge, setAcikBelge] = useState<MusteriBelge | null>(null);

  if (belgeler.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
        <p className="text-sm font-medium">Henüz radyoloji görüntüsü yok</p>
        <p className="text-sm text-muted-foreground">Röntgen, MR, tomografi veya ultrason yükleyin.</p>
        <Button type="button" size="sm" onClick={onYukle} className="mt-1">
          + Yükle
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {belgeler.map((b) => (
          <RadyolojiKarti
            key={b.id}
            belge={b}
            musteriId={musteriId}
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
  musteriId,
  rol,
  onAc,
}: {
  belge: MusteriBelge;
  musteriId: string;
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
    const sonuc = kalici ? await belgeKaliciSil(belge.id, musteriId) : await belgeSil(belge.id, musteriId);
    setSilmePending(false);
    if (!("error" in sonuc)) {
      queryClient.invalidateQueries({ queryKey: ["musteri_belge", musteriId, "radyoloji"] });
    }
    setSilinsinMi(false);
  }

  return (
    <div className="group relative flex flex-col gap-1.5 rounded-xl border border-border p-2">
      <button
        type="button"
        onClick={onAc}
        className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted"
      >
        {belge.dosya_mime === "application/pdf" ? (
          <FileText className="size-8 text-muted-foreground" />
        ) : thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Signed URL, kısa ömürlü
          <img src={thumbUrl} alt={BELGE_TURU_ETIKETLERI[belge.belge_turu]} className="h-full w-full object-cover" />
        ) : (
          <div className="size-6 animate-pulse rounded-full bg-muted-foreground/20" />
        )}
        <span className="absolute right-1 bottom-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {new Date(belge.cekim_tarihi).toLocaleDateString("tr-TR")}
        </span>
      </button>

      <div className="flex flex-col gap-0.5 px-0.5 text-xs">
        <span className="font-medium">{BELGE_TURU_ETIKETLERI[belge.belge_turu]}</span>
        {belge.bolge && (
          <span className="text-muted-foreground">
            {VUCUT_BOLGE_ETIKETLERI[belge.bolge as VucutBolgeKodu] ?? belge.bolge}
          </span>
        )}
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { isimBasHarfBuyukYap } from "@/lib/utils";
import type { SecenekSatir } from "@/types/randevu";

/**
 * Dropdown yerine yazarak arama: girilen harflerle hasta adı eşleştirilir,
 * seçilince gizli input'a hasta_id yazılır. Aranan/gösterilen isimler her
 * zaman baş harfleri büyük gösterilir.
 */
export function HastaArama<T extends SecenekSatir = SecenekSatir>({
  hastalar,
  name = "hasta_id",
  id,
  required,
  disabled,
  varsayilanId,
  varsayilanAd,
  onSecim,
  onTemizle,
}: {
  hastalar: T[];
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  varsayilanId?: string;
  varsayilanAd?: string;
  /** Bir hasta seçildiğinde tam satırı (örn. kategori gibi ek alanlarla) parent'a bildirir. */
  onSecim?: (hasta: T) => void;
  /** Seçim temizlendiğinde (kullanıcı yazmaya devam ederse) parent'ı bilgilendirir. */
  onTemizle?: () => void;
}) {
  const [sorgu, setSorgu] = useState(varsayilanAd ? isimBasHarfBuyukYap(varsayilanAd) : "");
  const [seciliId, setSeciliId] = useState(varsayilanId ?? "");
  const [acik, setAcik] = useState(false);
  const kapsayiciRef = useRef<HTMLDivElement>(null);

  const sonuclar = useMemo(() => {
    const q = sorgu.trim().toLocaleLowerCase("tr-TR");
    if (!q) return [];
    return hastalar.filter((m) => m.ad.toLocaleLowerCase("tr-TR").includes(q)).slice(0, 8);
  }, [sorgu, hastalar]);

  useEffect(() => {
    function disariTiklandi(e: MouseEvent) {
      if (kapsayiciRef.current && !kapsayiciRef.current.contains(e.target as Node)) {
        setAcik(false);
      }
    }
    document.addEventListener("mousedown", disariTiklandi);
    return () => document.removeEventListener("mousedown", disariTiklandi);
  }, []);

  return (
    <div ref={kapsayiciRef} className="relative flex flex-col gap-2">
      <input type="hidden" name={name} value={seciliId} required={required} />
      <Input
        id={id}
        value={sorgu}
        disabled={disabled}
        placeholder="Hasta adı yazın..."
        autoComplete="off"
        onFocus={() => setAcik(true)}
        onChange={(e) => {
          setSorgu(isimBasHarfBuyukYap(e.target.value));
          setSeciliId("");
          setAcik(true);
          onTemizle?.();
        }}
      />
      {acik && sorgu.trim() !== "" && (
        <div className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover text-sm text-popover-foreground shadow-md">
          {sonuclar.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">Eşleşen hasta yok.</p>
          ) : (
            sonuclar.map((m) => (
              <button
                key={m.id}
                type="button"
                className="flex w-full items-center px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setSorgu(isimBasHarfBuyukYap(m.ad));
                  setSeciliId(m.id);
                  setAcik(false);
                  onSecim?.(m);
                }}
              >
                {isimBasHarfBuyukYap(m.ad)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Archive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { arsiviGuncelle, stokFiyatlariniGuncelle } from "./actions";

export function EntegrasyonButonlari() {
  const [isPending, startTransition] = useTransition();
  const [mesaj, setMesaj] = useState<string | null>(null);

  function tetikle(aksiyon: () => Promise<{ success: boolean; message: string } | null>) {
    startTransition(async () => {
      const sonuc = await aksiyon();
      setMesaj(sonuc?.message ?? null);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={isPending}
          onClick={() => tetikle(arsiviGuncelle)}
          className={cn("bg-rose-600 text-white hover:bg-rose-700", "dark:bg-rose-600 dark:hover:bg-rose-700")}
        >
          <Archive className="size-4" />
          Arşivi Güncelle
        </Button>
        <Button
          type="button"
          disabled={isPending}
          onClick={() => tetikle(stokFiyatlariniGuncelle)}
          className={cn(
            "bg-violet-600 text-white hover:bg-violet-700",
            "dark:bg-violet-600 dark:hover:bg-violet-700"
          )}
        >
          <RefreshCw className="size-4" />
          Stok Fiyatları
        </Button>
      </div>
      {mesaj && <p className="max-w-sm text-right text-xs text-muted-foreground">{mesaj}</p>}
    </div>
  );
}

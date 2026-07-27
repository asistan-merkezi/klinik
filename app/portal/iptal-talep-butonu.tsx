"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { iptalTalebiOlustur } from "./actions";

export function IptalTalepButonu({ randevuId }: { randevuId: string }) {
  const [pending, startTransition] = useTransition();
  const [sonuc, setSonuc] = useState<{ success: boolean; message: string } | null>(null);

  if (sonuc?.success) {
    return <p className="text-xs text-emerald-600">{sonuc.message}</p>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await iptalTalebiOlustur(randevuId);
            setSonuc(r);
          })
        }
      >
        {pending ? "Gönderiliyor..." : "İptal talep et"}
      </Button>
      {sonuc && !sonuc.success && <p className="text-xs text-red-600">{sonuc.message}</p>}
    </div>
  );
}

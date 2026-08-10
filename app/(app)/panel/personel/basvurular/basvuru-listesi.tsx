"use client";

import type { IsBasvurusu } from "@/types/personel";
import { BasvuruSatiri } from "./basvuru-satiri";

export function BasvuruListesi({ basvurular }: { basvurular: IsBasvurusu[] }) {
  if (basvurular.length === 0) {
    return <p className="text-sm text-muted-foreground">Kayıt yok.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {basvurular.map((b) => (
        <BasvuruSatiri key={b.id} basvuru={b} />
      ))}
    </ul>
  );
}

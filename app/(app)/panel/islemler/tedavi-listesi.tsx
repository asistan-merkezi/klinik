"use client";

import { useState } from "react";
import type { SecenekSatir } from "@/types/randevu";
import type { IslemTanimiSatir } from "@/types/islem-tanimi";
import { IslemSatiri } from "./islem-satiri";

export function TedaviListesi({
  islemler,
  cihazlar,
  duzenlenebilir,
}: {
  islemler: IslemTanimiSatir[];
  cihazlar: SecenekSatir[];
  duzenlenebilir: boolean;
}) {
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {islemler.map((islem) => (
        <IslemSatiri
          key={islem.id}
          islem={islem}
          cihazlar={cihazlar}
          duzenlenebilir={duzenlenebilir}
          duzenleniyor={duzenlenenId === islem.id}
          onDuzenleBaslat={() => setDuzenlenenId(islem.id)}
          onDuzenleBitir={() => setDuzenlenenId(null)}
        />
      ))}
    </div>
  );
}

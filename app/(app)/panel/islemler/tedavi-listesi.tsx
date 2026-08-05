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

  const gorunenler = duzenlenenId ? islemler.filter((i) => i.id === duzenlenenId) : islemler;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {gorunenler.map((islem) => (
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
    </ul>
  );
}

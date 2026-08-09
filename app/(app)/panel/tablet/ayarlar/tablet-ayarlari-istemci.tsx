"use client";

import { useState } from "react";
import type { TabletAyarlari } from "@/types/tablet-ayarlari";
import { TabletAyarlariFormu } from "./tablet-ayarlari-formu";
import { TabletOnizleme } from "./tablet-onizleme";

export function TabletAyarlariIstemci({
  ayarlar,
  logoUrl,
}: {
  ayarlar: TabletAyarlari;
  logoUrl: string | null;
}) {
  const [durumlar, setDurumlar] = useState<TabletAyarlari>(ayarlar);

  function degistir(anahtar: keyof TabletAyarlari, deger: boolean) {
    setDurumlar((onceki) => ({ ...onceki, [anahtar]: deger }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <TabletAyarlariFormu durumlar={durumlar} onDegisiklik={degistir} />
      <div className="lg:sticky lg:top-8">
        <TabletOnizleme {...durumlar} logoUrl={logoUrl} />
      </div>
    </div>
  );
}

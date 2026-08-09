"use client";

import { useState } from "react";
import type { TabletAyarlari, TabletTemasi } from "@/types/tablet-ayarlari";
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

  function degistir(anahtar: keyof Omit<TabletAyarlari, "tema">, deger: boolean) {
    setDurumlar((onceki) => ({ ...onceki, [anahtar]: deger }));
  }

  function temaDegistir(tema: TabletTemasi) {
    setDurumlar((onceki) => ({ ...onceki, tema }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <TabletAyarlariFormu
        durumlar={durumlar}
        onDegisiklik={degistir}
        onTemaDegisiklik={temaDegistir}
      />
      <div className="lg:sticky lg:top-8">
        <TabletOnizleme {...durumlar} logoUrl={logoUrl} />
      </div>
    </div>
  );
}

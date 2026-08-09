"use client";

import { memo, useEffect, useState } from "react";
import { formatTime } from "@/lib/datetime";

/** İzole saat — kendi state'i/interval'ı bu bileşende, parent'ı hiç re-render etmez. */
function TabletSaatBase() {
  const [simdi, setSimdi] = useState(() => new Date());

  useEffect(() => {
    const zamanlayici = setInterval(() => setSimdi(new Date()), 30_000);
    return () => clearInterval(zamanlayici);
  }, []);

  return <span className="text-base font-medium tabular-nums">{formatTime(simdi.toISOString())}</span>;
}

export const TabletSaat = memo(TabletSaatBase);

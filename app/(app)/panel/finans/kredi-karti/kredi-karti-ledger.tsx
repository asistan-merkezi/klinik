"use client";

import { LedgerView } from "@/components/panel/ledger-view";
import type { DonemModu } from "@/lib/finans/donem";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";

export function KrediKartiLedger({
  gelenRows,
  gidenRows,
  openingBalance,
  mod,
  yil,
  ay,
}: {
  gelenRows: LedgerSatiri[];
  gidenRows: LedgerSatiri[];
  openingBalance: number;
  mod: DonemModu;
  yil: number;
  ay: number;
}) {
  return (
    <LedgerView
      gelenRows={gelenRows}
      gidenRows={gidenRows}
      openingBalance={openingBalance}
      mod={mod}
      yil={yil}
      ay={ay}
      yol="/panel/finans/kredi-karti"
      onEk="Kredi Kartı"
    />
  );
}

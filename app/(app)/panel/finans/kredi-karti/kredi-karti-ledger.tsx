"use client";

import { useRouter } from "next/navigation";
import { LedgerView } from "@/components/panel/ledger-view";
import type { LedgerSatiri } from "@/types/nakit-banka-hareketi";

export function KrediKartiLedger({
  gelenRows,
  gidenRows,
  openingBalance,
  yil,
}: {
  gelenRows: LedgerSatiri[];
  gidenRows: LedgerSatiri[];
  openingBalance: number;
  yil: number;
}) {
  const router = useRouter();

  return (
    <LedgerView
      gelenRows={gelenRows}
      gidenRows={gidenRows}
      openingBalance={openingBalance}
      yil={yil}
      onYilDegistir={(yeniYil) => router.push(`/panel/finans/kredi-karti?yil=${yeniYil}`)}
    />
  );
}

"use client";

import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableRow, TableCell } from "@/components/ui/table";
import type { FaturaSatir } from "@/types/odeme";
import type { FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
import { formatDate, formatTime } from "@/lib/datetime";
import { FaturaDurumHucresi } from "./fatura-satiri";

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export type FinansBorcSatiri = {
  id: string;
  hastaAdSoyad: string;
  islemAdi: string;
  tutar: number;
  iskontoTutari: number;
  /** KDV hariç tutar (matrah) — bkz. lib/fatura/kdv-hesapla.ts */
  matrah: number;
  kdvTutari: number;
  /** Hastadan fiilen tahsil edilen (iskonto sonrası, KDV dahil) net tutar. */
  toplamTutar: number;
  createdAt: string;
  fatura: FaturaSatir | null;
  faturaBilgisi: FaturaBilgisiKontrol;
};

/**
 * Satıra tıklayınca eskiden burada açılan düzenleme dialogu yerine artık
 * ayrı bir "mini fatura" sayfasına ([id]/page.tsx) gidiliyor (kullanıcı
 * kararı, 2026-09-28) — Fatura Kes/Vazgeç orada.
 */
export function FinansBorcSatiriBileseni({
  satir,
  duzenlenebilir,
}: {
  satir: FinansBorcSatiri;
  duzenlenebilir: boolean;
}) {
  const router = useRouter();

  return (
    <TableRow
      className={duzenlenebilir ? "cursor-pointer hover:bg-muted/40" : ""}
      onClick={duzenlenebilir ? () => router.push(`/panel/finans/gelirler-takibi/faturalar/${satir.id}`) : undefined}
    >
      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(satir.createdAt)}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{formatTime(satir.createdAt)}</TableCell>
      <TableCell className="font-medium">{satir.hastaAdSoyad}</TableCell>
      <TableCell className="text-foreground">{satir.islemAdi}</TableCell>
      <TableCell className="text-right tabular-nums">{paraFormat(satir.matrah)}</TableCell>
      <TableCell className="text-right tabular-nums">{paraFormat(satir.kdvTutari)}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">{paraFormat(satir.toplamTutar)}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        {satir.fatura ? (
          <FaturaDurumHucresi
            faturaId={satir.fatura.id}
            durum={satir.fatura.durum}
            hataMesaji={satir.fatura.hata_mesaji}
            eArsivPdfUrl={satir.fatura.e_arsiv_pdf_url}
          />
        ) : (
          <StatusBadge tone="slate">Faturasız</StatusBadge>
        )}
      </TableCell>
    </TableRow>
  );
}

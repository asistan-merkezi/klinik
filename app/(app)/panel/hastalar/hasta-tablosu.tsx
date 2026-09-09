"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { telefonGoster } from "@/lib/utils";
import type { HastaListeSatiri } from "@/types/hasta";
import { kvkkOnayVer } from "./actions";

function eksikAlanlariBul(hasta: HastaListeSatiri): string[] {
  const eksikler: string[] = [];
  if (!hasta.eposta?.trim()) eksikler.push("E-posta");
  if (!hasta.hasta_hassas?.adres?.trim()) eksikler.push("Adres");
  if (!hasta.telefon?.trim()) eksikler.push("Telefon");
  return eksikler;
}

/**
 * ≥768px için docs/DESIGN.md §3 "Patient Dossier & Tabular Lists" tablo
 * deseni — <768px'te hasta-satiri.tsx'in kart listesi kullanılıyor (bkz.
 * page.tsx). "Sorumlu Terapist" sütunu DESIGN'da var ama gerçek karşılığı
 * yok (hasta tablosunda/v_hasta_detay_ozet'te terapist ataması tutulmuyor)
 * — eklenmedi. "Protocol Number" yerine, projede zaten var olan Telefon
 * kullanıldı (ölçtüğümüz şeyi adlandırma ilkesi).
 */
export function HastaTablosu({ hastalar }: { hastalar: HastaListeSatiri[] }) {
  const router = useRouter();
  const [kvkkPendingId, setKvkkPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function kvkkOnayla(id: string) {
    setKvkkPendingId(id);
    startTransition(async () => {
      await kvkkOnayVer(id);
      setKvkkPendingId(null);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hasta</TableHead>
          <TableHead>Telefon</TableHead>
          <TableHead>Aktif Protokol</TableHead>
          <TableHead>Seans İlerlemesi</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {hastalar.map((hasta) => {
          const borcluMu = hasta.bakiye < 0;
          const eksikAlanlar = eksikAlanlariBul(hasta);

          return (
            <TableRow
              key={hasta.id}
              className="cursor-pointer"
              onClick={() => router.push(`/panel/hastalar/${hasta.id}`)}
            >
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <div className="relative shrink-0">
                    <Avatar name={hasta.ad_soyad} size="sm" />
                    <span
                      className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card ${borcluMu ? "bg-rose-500" : "bg-emerald-500"}`}
                      title={borcluMu ? "Cari borcu var" : "Cari borcu yok"}
                    />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{hasta.ad_soyad}</span>
                </div>
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{telefonGoster(hasta.telefon)}</TableCell>
              <TableCell className="text-muted-foreground">{hasta.aktif_protokol_ad ?? "—"}</TableCell>
              <TableCell className="min-w-32">
                {hasta.paketIlerleme ? (
                  <ProgressBar value={hasta.paketIlerleme.kullanilan} max={hasta.paketIlerleme.toplam} showLabel />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                {!hasta.kvkk_onay_tarihi ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={kvkkPendingId === hasta.id}
                    onClick={() => kvkkOnayla(hasta.id)}
                  >
                    KVKK onayı al
                  </Button>
                ) : eksikAlanlar.length > 0 ? (
                  <StatusBadge tone="amber">{eksikAlanlar.join(", ")} eksik</StatusBadge>
                ) : null}
              </TableCell>
              <TableCell>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { gorunumDurumBilgisi, gorunumDurumuHesapla } from "@/components/panel/randevu-kutusu";
import { formatTime } from "@/lib/datetime";
import type { RandevuSatir } from "@/types/randevu";

/**
 * Ana ekrandaki "Bugünkü Seanslar" KPI kartı — tıklanınca bugünün randevu
 * listesi (saat, hasta, tedavi, terapist, durum) salt-okunur bir bilgi
 * penceresinde açılır. Veri sayfa yüklendiği andaki sunucu görüntüsüdür.
 */
export function BugunkuSeanslarKarti({ randevular }: { randevular: RandevuSatir[] }) {
  const [acik, setAcik] = useState(false);
  const [simdi] = useState(() => new Date());

  const tamamlanan = randevular.filter((r) => ["geldi", "gecikmeli_geldi", "tamamlandi"].includes(r.durum)).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        aria-label="Bugünkü randevu listesini aç"
        className="rounded-2xl text-left transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <KpiCard
          label="Bugünkü Seanslar"
          value={`${tamamlanan} / ${randevular.length}`}
          icon={CalendarClock}
          iconTone="emerald"
          className="h-full cursor-pointer"
        />
      </button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bugünkü Randevular</DialogTitle>
            <DialogDescription>
              {randevular.length} randevu · {tamamlanan} seans başladı/tamamlandı
            </DialogDescription>
          </DialogHeader>

          {randevular.length === 0 ? (
            <EmptyState compact title="Bugün randevu yok" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Saat</TableHead>
                  <TableHead>Hasta</TableHead>
                  <TableHead className="hidden sm:table-cell">Tedavi</TableHead>
                  <TableHead className="hidden sm:table-cell">Terapist</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {randevular.map((r) => {
                  const durum = gorunumDurumBilgisi(r, gorunumDurumuHesapla(r, simdi));
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="tabular whitespace-nowrap">
                        {formatTime(r.baslangic)}–{formatTime(r.bitis)}
                      </TableCell>
                      <TableCell className="font-medium">{r.hasta?.ad_soyad ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {r.islem_tanimi?.ad ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {r.terapist?.personel?.ad_soyad ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={durum.tone} pulse={durum.pulse}>
                          {durum.etiket}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

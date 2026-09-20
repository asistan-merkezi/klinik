"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { useHastaTalepVeOneriler } from "./queries";
import type { IptalTalebiDurum } from "@/types/portal";

const TALEP_DURUM_TONU: Record<IptalTalebiDurum, StatusTone> = {
  bekliyor: "amber",
  onaylandi: "emerald",
  reddedildi: "rose",
};

const TALEP_DURUM_ETIKET: Record<IptalTalebiDurum, string> = {
  bekliyor: "İnceleniyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

export function TalepOneriModal({
  acik,
  onOpenChange,
  hastaId,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  hastaId: string;
}) {
  const { data, isLoading } = useHastaTalepVeOneriler(hastaId, acik);
  const randevuTalepleri = data?.randevuTalepleri ?? [];
  const iptalTalepleri = data?.iptalTalepleri ?? [];

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Talep ve Öneriler</DialogTitle>
          <DialogDescription>Hastanın portaldan gönderdiği randevu ve iptal talepleri.</DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}

        {!isLoading && randevuTalepleri.length === 0 && iptalTalepleri.length === 0 && (
          <p className="text-sm text-muted-foreground">Henüz talep yok.</p>
        )}

        {randevuTalepleri.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Randevu Talepleri</h3>
            <ul className="flex flex-col divide-y divide-border">
              {randevuTalepleri.map((t) => (
                <li key={t.id} className="flex flex-col gap-1 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.islem_tanimi?.ad ?? "—"}</span>
                    <StatusBadge tone={TALEP_DURUM_TONU[t.durum]}>{TALEP_DURUM_ETIKET[t.durum]}</StatusBadge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Tercih: {formatDate(t.tercih_tarih)}
                    {t.tercih_saat ? ` · ${t.tercih_saat.slice(0, 5)}` : ""}
                  </span>
                  {t.not_metni && <span className="text-xs text-muted-foreground">Not: {t.not_metni}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {iptalTalepleri.length > 0 && (
          <section className="flex flex-col gap-2 border-t border-border pt-3">
            <h3 className="text-sm font-semibold text-muted-foreground">İptal Talepleri</h3>
            <ul className="flex flex-col divide-y divide-border">
              {iptalTalepleri.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <span>{formatDateTime(t.randevuBaslangic)} tarihli randevu</span>
                  <StatusBadge tone={TALEP_DURUM_TONU[t.durum]}>{TALEP_DURUM_ETIKET[t.durum]}</StatusBadge>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

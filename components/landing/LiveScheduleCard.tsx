// components/landing/LiveScheduleCard.tsx
"use client";

import { useMemo } from "react";
import { Activity, Users } from "lucide-react";
import GlassPanel from "@/components/ui/GlassPanel";
import LiveClock from "./LiveClock";
import CurrentTimeLine from "./CurrentTimeLine";
import AppointmentSlot from "./AppointmentSlot";
import { useMinuteTick } from "@/lib/hooks/use-minute-tick";
import {
  DEMO_APPOINTMENTS,
  WINDOW_MINUTES,
  addMinutes,
  formatTime,
  getWindowStart,
  resolveStatus,
} from "@/lib/schedule";

const HOUR_MARKS = [0, 60, 120, 180, 240];

/**
 * Hero'nun imza öğesi: canlı randevu çizelgesi.
 *
 * Pencere, içinde bulunulan saatin bir saat öncesinden başlar ve 4 saat
 * sürer. Böylece ziyaretçi sayfayı gece 03:00'te de açsa çizelge dolu ve
 * akıyor görünür; "şu an" çizgisi her zaman kartın orta bandındadır.
 *
 * Render bütçesi:
 *  - Bu bileşen dakikada bir kez render olur (durum etiketleri için).
 *  - Saat metni ve zaman çizgisi kendi izole bileşenlerinde saniyede
 *    bir güncellenir; biri state, diğeri saf DOM yazımı kullanır.
 */
export default function LiveScheduleCard() {
  const now = useMinuteTick();

  const view = useMemo(() => {
    if (!now) return null;
    const windowStart = getWindowStart(now);
    return {
      windowStart,
      hourLabels: HOUR_MARKS.map((m) => ({
        offset: m,
        label: formatTime(addMinutes(windowStart, m)),
      })),
      slots: DEMO_APPOINTMENTS.map((appointment) => ({
        appointment,
        status: resolveStatus(appointment, windowStart, now),
        startLabel: formatTime(addMinutes(windowStart, appointment.offsetMin)),
      })),
    };
  }, [now]);

  const activeCount = view?.slots.filter((s) => s.status === "devam").length ?? 0;

  return (
    <GlassPanel className="w-full overflow-hidden">
      {/* Kart başlığı: canlı rozet + dijital saat */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary-500" aria-hidden />
          <h2 className="text-sm font-semibold text-ink">Günün Çizelgesi</h2>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-secondary-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-secondary-300 ring-1 ring-inset ring-secondary-500/30">
            <span className="h-1.5 w-1.5 animate-live-blink rounded-full bg-secondary-500" aria-hidden />
            <span className="hidden sm:inline">Canlı senkronizasyon</span>
            <span className="sm:hidden">Canlı</span>
          </span>
          <LiveClock />
        </div>
      </header>

      {/* Zaman ızgarası + randevu slotları */}
      <div className="thin-scroll schedule-track relative px-4 py-4 sm:px-5">
        <div
          className="relative"
          style={{ height: `calc(var(--pxpm) * ${WINDOW_MINUTES})` }}
        >
          {/* Saat çizgileri ve etiketleri */}
          {view?.hourLabels.map(({ offset, label }) => (
            <div
              key={offset}
              className="absolute inset-x-0 flex items-center"
              style={{ top: `calc(var(--pxpm) * ${offset})` }}
              aria-hidden
            >
              <span className="tabular w-12 shrink-0 font-mono text-xs text-ink-faint">
                {label}
              </span>
              <span className="h-px flex-1 bg-white/[0.07]" />
            </div>
          ))}

          {/* Slot sütunu — saat etiketi genişliği kadar içeri kaydırılır */}
          <div className="relative ml-12 h-full">
            {view ? (
              view.slots.map(({ appointment, status, startLabel }) => (
                <AppointmentSlot
                  key={appointment.id}
                  appointment={appointment}
                  status={status}
                  startLabel={startLabel}
                />
              ))
            ) : (
              // Hidrasyon öncesi iskelet — layout kaymasını (CLS) önler
              <div className="h-full animate-pulse rounded-xl bg-white/[0.03]" />
            )}

            {view && <CurrentTimeLine windowStartMs={view.windowStart.getTime()} />}
          </div>
        </div>
      </div>

      {/* Kart altı özet */}
      <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-ink-muted sm:px-5">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" aria-hidden />
          {activeCount > 0
            ? `${activeCount} muayene devam ediyor`
            : "Şu an aktif seans yok"}
        </span>
        <span className="text-ink-faint">Örnek veridir</span>
      </footer>
    </GlassPanel>
  );
}

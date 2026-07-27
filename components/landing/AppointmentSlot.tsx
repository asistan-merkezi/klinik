// components/landing/AppointmentSlot.tsx
import { STATUS_STYLE, type DemoAppointment, type SlotStatus } from "@/lib/schedule";
import { cn } from "@/lib/utils";

type AppointmentSlotProps = {
  appointment: DemoAppointment;
  status: SlotStatus;
  startLabel: string;
};

export default function AppointmentSlot({
  appointment,
  status,
  startLabel,
}: AppointmentSlotProps) {
  const style = STATUS_STYLE[status];

  return (
    <article
      className={cn(
        "absolute inset-x-0 overflow-hidden rounded-xl border px-3 py-2 backdrop-blur-sm transition-colors duration-200",
        style.card
      )}
      style={{
        // Geometri veriden türetilir; --pxpm globals.css'te tanımlıdır.
        top: `calc(var(--pxpm) * ${appointment.offsetMin})`,
        height: `calc(var(--pxpm) * ${appointment.durationMin} - 6px)`,
      }}
    >
      <span className={cn("absolute inset-y-0 left-0 w-0.5", style.accent)} aria-hidden />

      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold text-ink">
          {appointment.patient}
          <span className="tabular ml-2 font-mono text-xs font-normal text-ink-faint">
            {startLabel}
          </span>
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold leading-tight",
            style.badge
          )}
        >
          {style.label}
        </span>
      </div>

      <p className="mt-0.5 truncate text-xs text-ink-muted">
        {appointment.treatment}
        <span className="text-ink-faint"> · {appointment.therapist} · {appointment.room}</span>
      </p>
    </article>
  );
}

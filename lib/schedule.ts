// lib/schedule.ts
// Landing sayfasındaki canlı çizelgenin TEK veri ve kural kaynağı.
// Gerçek uygulamadaki randevu modeliyle karıştırılmaz — burası vitrin demosudur.

export type SlotStatus = "tamamlandi" | "devam" | "yolda" | "onaylandi";

export type DemoAppointment = {
  id: string;
  /** Pencere başlangıcından itibaren dakika cinsinden başlangıç */
  offsetMin: number;
  durationMin: number;
  therapist: string;
  /** KVKK vitrin disiplini: soyad maskeli gösterilir */
  patient: string;
  treatment: string;
  room: string;
};

/** Çizelgede görünen toplam zaman aralığı (dakika) */
export const WINDOW_MINUTES = 240;

/** "Yolda" etiketinin devreye girdiği eşik */
const ARRIVING_THRESHOLD_MIN = 30;

/**
 * Pencere, içinde bulunulan saatin bir saat öncesinden başlar.
 * Böylece "şu an" çizgisi her zaman kartın ortalarında durur ve
 * ziyaretçi hangi saatte gelirse gelsin çizelge canlı görünür.
 */
export function getWindowStart(now: Date): Date {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() - 1);
  return start;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

/** Randevunun o anki durumu saatten türetilir — elle durum girilmez. */
export function resolveStatus(
  appointment: DemoAppointment,
  windowStart: Date,
  now: Date
): SlotStatus {
  const start = addMinutes(windowStart, appointment.offsetMin).getTime();
  const end = addMinutes(windowStart, appointment.offsetMin + appointment.durationMin).getTime();
  const t = now.getTime();

  if (t >= end) return "tamamlandi";
  if (t >= start) return "devam";
  if (start - t <= ARRIVING_THRESHOLD_MIN * 60_000) return "yolda";
  return "onaylandi";
}

/** Durum → görünüm eşlemesi tek sözlükte (brand-ui kuralı) */
export const STATUS_STYLE: Record<
  SlotStatus,
  { label: string; badge: string; card: string; accent: string }
> = {
  tamamlandi: {
    label: "Tamamlandı",
    badge: "bg-white/5 text-ink-faint ring-1 ring-inset ring-white/10",
    card: "border-white/5 bg-white/[0.02] opacity-60",
    accent: "bg-white/15",
  },
  devam: {
    label: "Seansta",
    badge: "bg-primary-500/15 text-primary-200 ring-1 ring-inset ring-primary-500/40",
    card: "border-primary-500/40 bg-primary-500/[0.07] animate-slot-pulse",
    accent: "bg-primary-500",
  },
  yolda: {
    label: "Yolda",
    badge: "bg-warning-500/15 text-warning-300 ring-1 ring-inset ring-warning-500/35",
    card: "border-warning-500/25 bg-warning-500/[0.04]",
    accent: "bg-warning-400",
  },
  onaylandi: {
    label: "Onaylandı",
    badge: "bg-secondary-500/15 text-secondary-300 ring-1 ring-inset ring-secondary-500/35",
    card: "border-white/10 bg-white/[0.03]",
    accent: "bg-secondary-500",
  },
};

/**
 * Demo randevular. Tek dosyada durur — sektöre göre değiştirmek
 * (diş, dermatoloji, fizyoterapi) yalnızca bu diziyi düzenlemektir.
 */
export const DEMO_APPOINTMENTS: DemoAppointment[] = [
  {
    id: "a1",
    offsetMin: 0,
    durationMin: 40,
    therapist: "Fzt. Selin Aydın",
    patient: "M. Kaya",
    treatment: "Manuel Terapi",
    room: "Oda 2",
  },
  {
    id: "a2",
    offsetMin: 45,
    durationMin: 40,
    therapist: "Fzt. Burak Demir",
    patient: "Zeynep A.",
    treatment: "Fizyoterapi ve Rehabilitasyon",
    room: "Oda 1",
  },
  {
    id: "a3",
    offsetMin: 90,
    durationMin: 45,
    therapist: "Fzt. Elif Şen",
    patient: "Ahmet Y.",
    treatment: "Sporcu Recovery",
    room: "Oda 3",
  },
  {
    id: "a4",
    offsetMin: 140,
    durationMin: 40,
    therapist: "Fzt. Selin Aydın",
    patient: "Ceren T.",
    treatment: "Kontrol Randevusu",
    room: "Oda 2",
  },
  {
    id: "a5",
    offsetMin: 185,
    durationMin: 45,
    therapist: "Fzt. Elif Şen",
    patient: "Kerem B.",
    treatment: "3D Skolyoz Terapi",
    room: "Oda 3",
  },
];

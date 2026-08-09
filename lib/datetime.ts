import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

/**
 * Klinik saat dilimi — tüm randevu yazma/okuma akışlarının tek referansı.
 * Türkiye 2016'dan beri DST uygulamıyor (sabit UTC+3), bu yüzden burada
 * mevsimsel kayma riski yok.
 */
export const CLINIC_TZ = "Europe/Istanbul";

/**
 * Formdan/kullanıcıdan gelen, timezone'suz yerel tarih-saat string'ini
 * (örn. "2026-07-28T14:30" veya "2026-07-28T14:30:00") CLINIC_TZ'de
 * (İstanbul) yazılmış kabul edip UTC ISO string'e çevirir. DB'ye yazmadan
 * önce her zaman bu fonksiyondan geçirilmeli — asla çıplak `new Date(...)`
 * kullanılmamalı (sunucunun ambient TZ'sine bağımlı olur).
 */
export function toUTC(localDateTimeString: string): string {
  return fromZonedTime(localDateTimeString, CLINIC_TZ).toISOString();
}

/** UTC ISO -> İstanbul saatiyle "HH:mm". */
export function formatTime(utcIso: string): string {
  return formatInTimeZone(new Date(utcIso), CLINIC_TZ, "HH:mm");
}

/** UTC ISO -> İstanbul saatiyle "HH:mm:ss" (saniyeli canlı saat gösterimleri için). */
export function formatClock(utcIso: string): string {
  return formatInTimeZone(new Date(utcIso), CLINIC_TZ, "HH:mm:ss");
}

/** UTC ISO -> İstanbul tarihiyle "dd.MM.yyyy". */
export function formatDate(utcIso: string): string {
  return formatInTimeZone(new Date(utcIso), CLINIC_TZ, "dd.MM.yyyy");
}

/** UTC ISO -> İstanbul tarih+saatiyle "dd.MM.yyyy HH:mm". */
export function formatDateTime(utcIso: string): string {
  return formatInTimeZone(new Date(utcIso), CLINIC_TZ, "dd.MM.yyyy HH:mm");
}

/** UTC ISO -> `<input type="date">` için İstanbul tarihiyle "yyyy-MM-dd". */
export function formatDateForInput(utcIso: string): string {
  return formatInTimeZone(new Date(utcIso), CLINIC_TZ, "yyyy-MM-dd");
}

/** Şu anın İstanbul takvim tarihi, "yyyy-MM-dd" — `date` kolonlarıyla (vade_tarihi vb.) string karşılaştırması için. */
export function bugunIstanbulTarihi(): string {
  return formatInTimeZone(new Date(), CLINIC_TZ, "yyyy-MM-dd");
}

/** UTC ISO -> `<input type="time">` için İstanbul saatiyle "HH:mm". */
export function formatTimeForInput(utcIso: string): string {
  return formatTime(utcIso);
}

/**
 * Verilen anın İstanbul takvim gününün başlangıcı (o günün 00:00'ı,
 * İstanbul'da), UTC ISO string olarak. "Bugünün randevuları" gibi gün
 * aralığı sorgularında kullanılır.
 */
export function startOfDayUTC(date: Date = new Date()): string {
  const istanbulTarihi = formatInTimeZone(date, CLINIC_TZ, "yyyy-MM-dd");
  return toUTC(`${istanbulTarihi}T00:00:00`);
}

/**
 * Verilen anın İstanbul takvim gününün bitişi (ertesi günün 00:00'ı,
 * İstanbul'da), UTC ISO string olarak. Gün aralığı sorgularında üst sınır
 * (exclusive) olarak kullanılır.
 */
export function endOfDayUTC(date: Date = new Date()): string {
  const gunBaslangicMs = new Date(startOfDayUTC(date)).getTime();
  return new Date(gunBaslangicMs + 24 * 60 * 60 * 1000).toISOString();
}

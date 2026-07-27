// lib/hooks/use-minute-tick.ts
"use client";

import { useEffect, useState } from "react";

/**
 * Dakikada bir değişen bir Date döndürür.
 *
 * Amaç: randevu durum etiketleri ("Yolda" → "Seansta" → "Tamamlandı")
 * saatle birlikte kendiliğinden ilerlesin ama saniyede bir re-render
 * tetiklenmesin. Saniye hassasiyeti gereken iki yer (dijital saat ve
 * "şu an" çizgisi) kendi izole bileşenlerinde çalışır.
 *
 * SSR'da null döner; böylece sunucu/istemci arasında hidrasyon
 * uyuşmazlığı oluşmaz.
 */
export function useMinuteTick(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    // İlk tetiklemeyi dakika başına hizala, sonra 60 sn'de bir devam et.
    let intervalId: ReturnType<typeof setInterval>;
    const msToNextMinute = 60_000 - (Date.now() % 60_000);

    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, msToNextMinute);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);

  return now;
}

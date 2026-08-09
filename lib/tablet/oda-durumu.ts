export type OdaDurumu = "musait" | "hazirlaniyor" | "mesgul";

export type OdaDurumuBilgisi = {
  etiket: string;
  /** Aura gradient, sol kenar şeridi, alt ilerleme çubuğu ve (varsa) RGB LED şeridi — hepsi bu tek değerden beslenir. */
  renk: string;
  /**
   * Durum rozeti metni için WCAG kontrastı sağlayan Tailwind sınıfı — açık
   * temada 600 tonu (koyu, okunaklı), koyu temada 300 tonu (açık, saf beyaz
   * değil). `components/ui/status-badge.tsx`'teki tone deseniyle aynı yaklaşım.
   */
  metinSinifi: string;
  auraOpacity: number;
};

/** Kapı tableti durum renk sözlüğü — tek kaynak. Yeni bir yerde bu renklere ihtiyaç duyulursa (ör. ileride RGB LED şeridi entegrasyonu) buradan okunmalı, ayrı hardcode edilmemeli. */
export const ODA_DURUMU: Record<OdaDurumu, OdaDurumuBilgisi> = {
  musait: {
    etiket: "Müsait",
    renk: "#10B981",
    // Açık temada 600/700 ölçülen kontrastı (WCAG hesabıyla doğrulandı)
    // 4.5:1 eşiğini geçmiyor/sınırda kalıyordu — 800 kullanılıyor.
    metinSinifi: "text-emerald-800 dark:text-emerald-300",
    auraOpacity: 0.2,
  },
  hazirlaniyor: {
    etiket: "Hazırlanıyor",
    renk: "#F59E0B",
    metinSinifi: "text-amber-800 dark:text-amber-300",
    auraOpacity: 0.2,
  },
  mesgul: {
    etiket: "Seans sürüyor",
    renk: "#F43F5E",
    metinSinifi: "text-rose-800 dark:text-rose-300",
    auraOpacity: 0.2,
  },
};

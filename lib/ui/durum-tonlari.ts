/**
 * StatusBadge'in TEK renk kaynağı (docs/DESIGN.md "Status Chips & Medical
 * Badges" + "Functional & Status Spectrum" — "Klinik Durumları" spektrumu).
 * DESIGN'ın verdiği literal açık-tema hex'leri (50/200/700-800 tier) birebir
 * Tailwind'in stok renk skalasına denk geldiği için ayrı bir CSS değişkeni
 * açılmadı, doğrudan Tailwind sınıfları kullanıldı. Koyu tema DESIGN'da
 * tarif edilmiyor — bu turdan önceki mevcut dark treatment (yarı-saydam
 * 500/10 dolgu + 400 tonu metin) korundu.
 *
 * Mevcut/DESIGN'da karşılığı olmayan iki tona (sky, primary) da AYNI ailesel
 * desen (light: 50/800/200, dark: 500/10 + 400) uygulandı — tutarlılık için,
 * "primary" hariç (o zaten --primary token'ından geliyor, otomatik tema-duyarlı).
 *
 * randevu-kutusu.tsx (+ seans-gecmisi-zaman-cizelgesi.tsx'in aynı durum
 * eşlemesi) Faz 3.5'te buraya bağlandı (bkz. DURUM_KUTU_RENKLERI altta).
 * lib/tablet/oda-durumu.ts (tablet, kapsam dışı) ve icon-tile.tsx (kategorik
 * ikon tonu, durum değil) bilinçli olarak BAĞLANMADI.
 */

export type StatusTone = "emerald" | "amber" | "teal" | "rose" | "indigo" | "sky" | "slate" | "primary";

export const DURUM_TONU_SINIFLARI: Record<StatusTone, string> = {
  /** Tamamlandı */
  emerald:
    "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:border-transparent dark:bg-emerald-500/10 dark:text-emerald-400",
  /** Beklemede */
  amber:
    "bg-amber-50 text-amber-800 border border-amber-200 dark:border-transparent dark:bg-amber-500/10 dark:text-amber-400",
  /** Seans Başladı / Aktif — pulse prop'uyla birlikte kullanılır. */
  teal: "bg-teal-50 text-teal-700 border border-teal-200 dark:border-transparent dark:bg-teal-500/10 dark:text-teal-400",
  /** İptal Edildi / Gelmedi (Kritik) */
  rose: "bg-rose-50 text-rose-800 border border-rose-200 dark:border-transparent dark:bg-rose-500/10 dark:text-rose-400",
  /**
   * Değerlendirme Bekliyor — "Status Chips" bölümünde ayrıca tarif
   * edilmemiş, "Functional & Status Spectrum"taki fill/surface üçlüsünden
   * (#4F46E5/#EEF2FF) aynı aile deseniyle (50/800/200) genişletildi; border
   * indigo-200 kullanıldı — DESIGN'ın spektrum bölümündeki daha koyu
   * #818CF8/indigo-400 değeri "ambient ring" amaçlı, badge kenarlığı için
   * bilinçli bir yorum farkı (diğer 4 badge de pale/200-tier kenarlık
   * kullanıyor, tutarlılık tercih edildi).
   */
  indigo:
    "bg-indigo-50 text-indigo-800 border border-indigo-200 dark:border-transparent dark:bg-indigo-500/10 dark:text-indigo-300",
  /** DESIGN'da karşılığı yok — mevcut kullanım (örn. "ertelendi") aynı aile desenine taşındı. */
  sky: "bg-sky-50 text-sky-800 border border-sky-200 dark:border-transparent dark:bg-sky-500/10 dark:text-sky-400",
  /**
   * Nötr. WCAG düzeltmesi (Faz 4): açık temada --muted-foreground (#64748B)
   * bg-muted (#F1F5F9) üzerinde 4.34:1 — 4.5:1'i geçmiyordu. --muted-foreground
   * PROJE GENELİNDE paylaşılan bir token olduğu için değiştirilmedi (kapsam
   * dışına taşardı); sadece bu rozete özel, bir ton koyu bir Tailwind rengi
   * (slate-600, 6.92:1) kullanıldı. Koyu tema zaten geçiyordu (6.96:1),
   * dark: override'ı mevcut --muted-foreground'u aynen koruyor.
   */
  slate: "bg-muted text-slate-600 dark:text-muted-foreground",
  /**
   * WCAG düzeltmesi (Faz 4): koyu temada --primary (#2563EB) bg-primary/10
   * üzerinde 2.58:1 — açık uçurumla geçmiyordu. Kullanıcı kararı: zemin değil
   * metin tonu açıldı (--primary token'ına dokunulmadı, o dolu buton/aktif-nav
   * zemini için ayrıca kalibre edilmişti). blue-400 (#60A5FA) her iki olası
   * arka plana (card/background) karşı da rahatça geçiyor (5.25/7.09).
   * Açık temada text-primary (7.40:1) zaten geçiyordu, değişmedi.
   */
  primary: "bg-primary/10 text-primary dark:text-blue-400",
};

/** pulse=true iken "Seans Başladı" nabız noktası — DESIGN'ın literal teal-500 (#14B8A6). */
export const DURUM_NABIZ_RENGI = "bg-teal-500";

/**
 * randevu-kutusu.tsx'teki takvim kutucuğu için — StatusBadge'in tek-className
 * rozetinden farklı olarak 3 parçalı (sol şerit/dolgu/kenar). Aynı hue'lar,
 * farklı yapı — tek renk kaynağı burada, iki farklı UI ihtiyacına (pill rozet
 * vs. dikdörtgen kutucuk) göre iki şekilde dışa veriliyor.
 */
export type DurumKutuRengi = { serit: string; dolgu: string; kenar: string };

export const DURUM_KUTU_RENKLERI: Record<StatusTone, DurumKutuRengi> = {
  emerald: { serit: "bg-emerald-500", dolgu: "bg-emerald-500/10", kenar: "border-emerald-300 dark:border-emerald-500/40" },
  amber: { serit: "bg-amber-500", dolgu: "bg-amber-500/10", kenar: "border-amber-300 dark:border-amber-500/40" },
  teal: { serit: "bg-teal-500", dolgu: "bg-teal-500/10", kenar: "border-teal-300 dark:border-teal-500/40" },
  rose: { serit: "bg-rose-500", dolgu: "bg-rose-500/10", kenar: "border-rose-300 dark:border-rose-500/40" },
  indigo: { serit: "bg-indigo-500", dolgu: "bg-indigo-500/10", kenar: "border-indigo-300 dark:border-indigo-500/40" },
  sky: { serit: "bg-sky-500", dolgu: "bg-sky-500/10", kenar: "border-sky-300 dark:border-sky-500/40" },
  slate: { serit: "bg-muted-foreground/40", dolgu: "bg-muted/40", kenar: "border-border" },
  primary: { serit: "bg-primary", dolgu: "bg-primary/10", kenar: "border-primary/40" },
};

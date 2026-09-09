import { memo } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";
import type { RandevuSatir } from "@/types/randevu";
import {
  DURUM_TONU_SINIFLARI,
  DURUM_KUTU_RENKLERI,
  DURUM_NABIZ_RENGI,
  type StatusTone,
  type DurumKutuRengi,
} from "@/lib/ui/durum-tonlari";

export type GorunumDurumu =
  | "planlandi"
  | "geldi"
  | "gecikmeli_geldi"
  | "seansta"
  | "iptal"
  | "gelmedi"
  | "ertelendi"
  | "tamamlandi";

/**
 * Randevunun ekrandaki durumu DB durumundan türetilir. Süre geçince kendiliğinden
 * "Tamamlandı"ya DÖNMEZ (kullanıcı kararı: kutucuğa girilip elle bir işlem
 * yapılmadan hiçbir şey değişmemeli — süresi geçmiş ama hâlâ "Planlandı" duran
 * bir randevu, aslında check-in unutulmuş olabilir; "Tamamlandı" göstermek bunu
 * gizler). Tek istisna "seansta": bu, zaten resepsiyonun elle "Geldi"
 * işaretlediği bir randevuya, seans saati geldiğinde eklenen canlı bir nabız
 * rozetidir — durumu DEĞİŞTİRMEZ, sadece "Geldi"nin üstüne görsel bir vurgu ekler.
 */
export function gorunumDurumuHesapla(randevu: RandevuSatir, simdi: Date): GorunumDurumu {
  if (randevu.durum === "iptal" || randevu.durum === "gelmedi") return randevu.durum;
  const baslangic = new Date(randevu.baslangic);
  if ((randevu.durum === "geldi" || randevu.durum === "gecikmeli_geldi") && simdi >= baslangic) return "seansta";
  return randevu.durum;
}

// docs/DESIGN.md'nin "Klinik Durumları" spektrumuna göre — lib/ui/durum-tonlari.ts
// TEK renk kaynağı, badge rozeti oradan (DURUM_TONU_SINIFLARI), kutucuğun
// sol şerit/dolgu/kenar üçlüsü oradan (DURUM_KUTU_RENKLERI). 8 durumun HEPSİ
// (planlandi/geldi/gecikmeli_geldi/seansta/iptal/gelmedi/ertelendi/tamamlandi)
// tek tek doğrulandı — CLAUDE.md'de "iptal"in bir zamanlar hiç renk
// tanımlamadığı belgeleniyordu, burada 8'i de gerçek bir tone'a bağlı.
// "seansta" DESIGN'ın "Seans Başladı / Aktif (Active Pulse)" tanımına göre
// artık teal+pulse — kutu rengi (kutuRenkOverride) yine "geldi" ile aynı
// yeşil kalıyor (durum aslında hâlâ "geldi", sadece canlı bir vurgu ekleniyor).
const DURUM_STIL: Record<
  GorunumDurumu,
  {
    etiket: string;
    tone: StatusTone;
    adSinif?: string;
    soluk?: boolean;
    vurgu?: string;
    pulse?: boolean;
    kutuRenkOverride?: DurumKutuRengi;
  }
> = {
  planlandi: { etiket: "Planlandı", tone: "slate" },
  geldi: { etiket: "Geldi", tone: "emerald" },
  seansta: {
    etiket: "Seansta",
    tone: "teal",
    pulse: true,
    vurgu: "ring-2 ring-primary ring-offset-1 ring-offset-background",
    kutuRenkOverride: DURUM_KUTU_RENKLERI.emerald,
  },
  gecikmeli_geldi: { etiket: "Gecikmeli Geldi", tone: "emerald" },
  iptal: { etiket: "İptal", tone: "rose", adSinif: "line-through", soluk: true },
  gelmedi: { etiket: "Gelmedi", tone: "rose", adSinif: "line-through" },
  ertelendi: { etiket: "Ertelendi", tone: "sky" },
  tamamlandi: { etiket: "Tamamlandı", tone: "slate", soluk: true },
};

// Tedavi (islem_tanimi) başına sabit, tutarlı bir renk — id'den türetilir,
// elle renk seçimi/ekstra alan gerekmez. Sınıflar tam literal yazılır
// (şablon string ile üretilmez), yoksa Tailwind'in statik taraması bunları
// göremez ve stil hiç üretilmez.
const TEDAVI_PALETI = [
  { serit: "bg-blue-500", dolgu: "bg-blue-500/10", kenar: "border-blue-300 dark:border-blue-500/40" },
  { serit: "bg-violet-500", dolgu: "bg-violet-500/10", kenar: "border-violet-300 dark:border-violet-500/40" },
  { serit: "bg-amber-500", dolgu: "bg-amber-500/10", kenar: "border-amber-300 dark:border-amber-500/40" },
  { serit: "bg-rose-500", dolgu: "bg-rose-500/10", kenar: "border-rose-300 dark:border-rose-500/40" },
  { serit: "bg-teal-500", dolgu: "bg-teal-500/10", kenar: "border-teal-300 dark:border-teal-500/40" },
  { serit: "bg-indigo-500", dolgu: "bg-indigo-500/10", kenar: "border-indigo-300 dark:border-indigo-500/40" },
  { serit: "bg-orange-500", dolgu: "bg-orange-500/10", kenar: "border-orange-300 dark:border-orange-500/40" },
  { serit: "bg-fuchsia-500", dolgu: "bg-fuchsia-500/10", kenar: "border-fuchsia-300 dark:border-fuchsia-500/40" },
  { serit: "bg-cyan-500", dolgu: "bg-cyan-500/10", kenar: "border-cyan-300 dark:border-cyan-500/40" },
  { serit: "bg-lime-500", dolgu: "bg-lime-500/10", kenar: "border-lime-300 dark:border-lime-500/40" },
] as const;

const TEDAVI_NOTR = { serit: "bg-muted-foreground/40", dolgu: "bg-muted/40", kenar: "border-border" };

export function tedaviRengi(islemTanimiId: string | undefined | null) {
  if (!islemTanimiId) return TEDAVI_NOTR;
  let toplam = 0;
  for (let i = 0; i < islemTanimiId.length; i++) {
    toplam = (toplam + islemTanimiId.charCodeAt(i)) % 9973;
  }
  return TEDAVI_PALETI[toplam % TEDAVI_PALETI.length];
}

type RandevuKutusuProps = {
  randevu: RandevuSatir;
  gorunumDurumu: GorunumDurumu;
  /** true ise (seansta + yetkili terapist/admin) kutu, hasta detayının Tedavi & Anamnez sekmesine bağlanır. */
  hastaLinki?: boolean;
};

export const RandevuKutusu = memo(function RandevuKutusu({
  randevu,
  gorunumDurumu,
  hastaLinki = false,
}: RandevuKutusuProps) {
  const stil = DURUM_STIL[gorunumDurumu];
  // "Planlandı" (henüz gerçekleşmemiş) kutuları DURUM'a göre değil TEDAVİYE
  // göre renklenir (görsel tarama kolaylığı) — bu tek istisna, diğer 7 durumun
  // hepsi kendi tone'una göre renklenir (bkz. DURUM_STIL yorumu).
  const renk =
    gorunumDurumu === "planlandi"
      ? tedaviRengi(randevu.islem_tanimi?.id)
      : (stil.kutuRenkOverride ?? DURUM_KUTU_RENKLERI[stil.tone]);
  const etiket =
    gorunumDurumu === "gecikmeli_geldi" && randevu.gecikme_dakika
      ? `${stil.etiket} (${randevu.gecikme_dakika} dk)`
      : stil.etiket;
  const baslikMetni = [
    randevu.hasta?.ad_soyad,
    formatTime(randevu.baslangic),
    randevu.terapist?.personel?.ad_soyad,
    randevu.islem_tanimi?.ad,
    etiket,
    hastaLinki ? "Tedavi & Anamnez'e git" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      id={`randevu-${randevu.id}`}
      title={baslikMetni}
      className={cn(
        "relative flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-lg border pl-2.5 pr-1.5 py-1 transition-colors",
        renk.dolgu,
        renk.kenar,
        stil.soluk && "opacity-50",
        stil.vurgu
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", renk.serit)} aria-hidden />

      <div className="flex flex-wrap items-start justify-between gap-x-1 gap-y-0.5">
        <p className={cn("min-w-0 truncate text-xs font-semibold text-foreground", stil.adSinif)}>
          {randevu.hasta?.ad_soyad ?? "—"}
        </p>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
            DURUM_TONU_SINIFLARI[stil.tone]
          )}
        >
          {stil.pulse && (
            <span className={cn("size-1.5 animate-pulse rounded-full", DURUM_NABIZ_RENGI)} aria-hidden />
          )}
          {etiket}
          {hastaLinki && <ArrowUpRight className="size-2.5" aria-hidden />}
        </span>
      </div>

      <p className="truncate text-[11px] text-muted-foreground">
        {formatTime(randevu.baslangic)} · {randevu.terapist?.personel?.ad_soyad ?? "—"}
      </p>
    </article>
  );
});

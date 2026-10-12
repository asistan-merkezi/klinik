import { formatInTimeZone } from "date-fns-tz";
import { CLINIC_TZ, toUTC } from "@/lib/datetime";

/**
 * Sessiz saat: bu aralıkta hastaya/personele mesaj GİTMEZ, aralık bitince gider (kuyrukta `planlanan_zaman`
 * ileriye alınır). Saatler İstanbul saatine göre "HH:mm"; aralık gece yarısını aşabilir (21:00 → 08:00).
 * Ayar `klinik_ayarlar.ayarlar.mesaj_sessiz_saat`'te ({baslangic, bitis} ya da {kapali:true}); yoksa varsayılan.
 */
export type SessizSaatAyari = { baslangic: string; bitis: string };

export const VARSAYILAN_SESSIZ_SAAT: SessizSaatAyari = { baslangic: "21:00", bitis: "08:00" };

/**
 * Sessiz saatten MUAF tetikleyiciler: iptal/erteleme bilgisi zamana duyarlı (hasta yola çıkmasın) — bekletmek zarar verir.
 */
export const SESSIZ_SAAT_MUAF_TETIKLEYICILER: readonly string[] = ["randevu_iptal"];

const SAAT_DESENI = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** DB'den gelen ham ayarı doğrular; kapalıysa `null` (sessiz saat uygulanmaz), bozuksa varsayılan. */
export function sessizSaatAyariCoz(ham: unknown): SessizSaatAyari | null {
  if (ham && typeof ham === "object") {
    const o = ham as Record<string, unknown>;
    if (o.kapali === true) return null;
    if (typeof o.baslangic === "string" && typeof o.bitis === "string" && SAAT_DESENI.test(o.baslangic) && SAAT_DESENI.test(o.bitis) && o.baslangic !== o.bitis) {
      return { baslangic: o.baslangic, bitis: o.bitis };
    }
  }
  return VARSAYILAN_SESSIZ_SAAT;
}

const dakika = (hhmm: string) => {
  const [s, d] = hhmm.split(":").map(Number);
  return s * 60 + d;
};

/** `an` İstanbul saatiyle sessiz aralıkta mı? [baslangic, bitis) — bitişin kendisi artık serbest. */
export function sessizSaatteMi(an: Date, ayar: SessizSaatAyari): boolean {
  const simdi = dakika(formatInTimeZone(an, CLINIC_TZ, "HH:mm"));
  const b = dakika(ayar.baslangic);
  const e = dakika(ayar.bitis);
  return b < e ? simdi >= b && simdi < e : simdi >= b || simdi < e;
}

/**
 * Mesajın gönderilebileceği ilk an: sessiz değilse `an`'ın kendisi, sessizse aralığın bittiği an (İstanbul).
 * Gece yarısından sonraki sessiz dilimdeysek bitiş AYNI günün sabahı, öncesindeysek (21:00-24:00) ertesi gün sabahıdır.
 */
export function gonderimZamani(an: Date, ayar: SessizSaatAyari | null): Date {
  if (!ayar || !sessizSaatteMi(an, ayar)) return an;
  const bugun = formatInTimeZone(an, CLINIC_TZ, "yyyy-MM-dd");
  const simdi = dakika(formatInTimeZone(an, CLINIC_TZ, "HH:mm"));
  const bitisGunu = simdi >= dakika(ayar.bitis) ? ertesiGun(bugun) : bugun;
  return new Date(toUTC(`${bitisGunu}T${ayar.bitis}:00`));
}

function ertesiGun(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

import { CLINIC_TZ } from "./datetime";
import { formatInTimeZone } from "date-fns-tz";
import type {
  DonemDurum,
  PersonelPuantajSatir,
  PersonelVardiyaAtamaSatir,
  PuantajGunSatiri,
  YillikAySatiri,
} from "@/types/puantaj";

/** dakika -> "1sa 30dk" / "—" (null/undefined ise). */
export function dakikaEtiket(dakika: number | null | undefined): string {
  if (dakika == null) return "—";
  const saat = Math.floor(dakika / 60);
  const kalanDk = dakika % 60;
  if (saat === 0) return `${kalanDk}dk`;
  if (kalanDk === 0) return `${saat}sa`;
  return `${saat}sa ${kalanDk}dk`;
}

/** dakika -> ondalıklı saat (rapor/özet şeridi için, örn. 90 -> 1.5). */
export function dakikaSaate(dakika: number | null | undefined): number {
  if (dakika == null) return 0;
  return Math.round((dakika / 60) * 100) / 100;
}

/** saat sayısı -> "168" (tam sayıysa) veya "16.5" (küsuratlıysa). */
export function saatEtiket(saat: number): string {
  return Number.isInteger(saat) ? String(saat) : saat.toFixed(1);
}

/** "HH:mm:ss" veya "HH:mm" -> "HH:mm". */
export function saatKisalt(saat: string | null | undefined): string {
  if (!saat) return "—";
  return saat.slice(0, 5);
}

/** Ayın tüm günlerini "YYYY-MM-DD" olarak döndürür (yil/ay: 1-12 ay insan formatında). */
export function ayinGunleri(yil: number, ay: number): string[] {
  const gunSayisi = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  return Array.from({ length: gunSayisi }, (_, i) => {
    const gun = i + 1;
    return `${yil}-${String(ay).padStart(2, "0")}-${String(gun).padStart(2, "0")}`;
  });
}

/** "YYYY-MM-DD" -> Postgres EXTRACT(DOW) ile birebir (0=Pazar...6=Cumartesi). */
export function haftaninGunu(tarihIso: string): number {
  const [yil, ay, gun] = tarihIso.split("-").map(Number);
  return new Date(Date.UTC(yil, ay - 1, gun)).getUTCDay();
}

/** İstanbul takviminde bugünün tarihi, "YYYY-MM-DD". */
export function bugunTarih(): string {
  return formatInTimeZone(new Date(), CLINIC_TZ, "yyyy-MM-dd");
}

/**
 * Verilen personel_vardiya_atama listesinden, belirli bir tarih için o an
 * geçerli atamayı bulur (personel_puantaj_planlanan_getir RPC'siyle aynı
 * mantık — yıllık/aylık görünümde her gün için ayrı RPC çağrısı yapmamak
 * için client tarafında tekrarlanıyor).
 */
export function gecerliAtamaBul(
  atamalar: PersonelVardiyaAtamaSatir[],
  tarihIso: string
): PersonelVardiyaAtamaSatir | null {
  const gun = haftaninGunu(tarihIso);
  const adaylar = atamalar.filter(
    (a) =>
      a.haftanin_gunu === gun &&
      a.gecerlilik_baslangic <= tarihIso &&
      (a.gecerlilik_bitis == null || a.gecerlilik_bitis >= tarihIso)
  );
  if (adaylar.length === 0) return null;
  return adaylar.reduce((en, a) => (a.gecerlilik_baslangic > en.gecerlilik_baslangic ? a : en));
}

/** Ay için gün-gün görünüm satırlarını (kayıt varsa DB'den, yoksa atamadan sanal planlanan) üretir. */
export function ayGunSatirlariOlustur(
  yil: number,
  ay: number,
  kayitlar: PuantajGunSatiri["kayit"][],
  atamalar: PersonelVardiyaAtamaSatir[]
): PuantajGunSatiri[] {
  const kayitMap = new Map(kayitlar.filter((k): k is NonNullable<typeof k> => k != null).map((k) => [k.tarih, k]));
  return ayinGunleri(yil, ay).map((tarih) => {
    const kayit = kayitMap.get(tarih) ?? null;
    if (kayit) return { tarih, kayit, sanalPlanlanan: null };
    const atama = gecerliAtamaBul(atamalar, tarih);
    return {
      tarih,
      kayit: null,
      sanalPlanlanan: atama ? { baslangic: atama.vardiya_turu.baslangic_saat, bitis: atama.vardiya_turu.bitis_saat } : null,
    };
  });
}

/** Ertesi gün, "YYYY-MM-DD" (gece vardiyasında çıkış saati ertesi güne sarkarsa). */
export function sonrakiGun(tarihIso: string): string {
  const [yil, ay, gun] = tarihIso.split("-").map(Number);
  const d = new Date(Date.UTC(yil, ay - 1, gun + 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export type AyOzeti = {
  netDakika: number;
  onayliFmDakika: number;
  bekleyenFmDakika: number;
  eksikDakika: number;
  izinGun: number;
  devamsizlikGun: number;
  calismaGunSayisi: number;
};

/** aySatirOzetiHesapla'nın gerçekte okuduğu alanlar — sorgularda gereksiz kolon seçmeden çağrılabilsin diye. */
export type PuantajOzetSatiri = Pick<
  PersonelPuantajSatir,
  "net_calisma_dakika" | "fazla_mesai_dakika" | "fm_onay_durumu" | "eksik_calisma_dakika" | "durum"
>;

/** Bir ay/dönem için özet şeridi hesaplar (personel_puantaj_donem_kapat RPC'sindeki aynı toplama mantığı, client tarafında canlı gösterim için). */
export function aySatirOzetiHesapla(kayitlar: PuantajOzetSatiri[]): AyOzeti {
  let netDakika = 0;
  let onayliFmDakika = 0;
  let bekleyenFmDakika = 0;
  let eksikDakika = 0;
  let izinGun = 0;
  let devamsizlikGun = 0;
  let calismaGunSayisi = 0;

  for (const k of kayitlar) {
    if (k.net_calisma_dakika != null) {
      netDakika += k.net_calisma_dakika;
      calismaGunSayisi += 1;
    }
    if (k.fazla_mesai_dakika != null) {
      if (k.fm_onay_durumu === "onaylandi") onayliFmDakika += k.fazla_mesai_dakika;
      else if (k.fm_onay_durumu === "bekliyor") bekleyenFmDakika += k.fazla_mesai_dakika;
    }
    if (k.eksik_calisma_dakika != null) eksikDakika += k.eksik_calisma_dakika;
    if (k.durum === "izinli" || k.durum === "raporlu") izinGun += 1;
    if (k.durum === "gelmedi") devamsizlikGun += 1;
  }

  return { netDakika, onayliFmDakika, bekleyenFmDakika, eksikDakika, izinGun, devamsizlikGun, calismaGunSayisi };
}

/** Yıllık görünüm: bir yılın personel_puantaj satırlarını 12 ay satırına gruplar; dönem durumu (açık/kapalı) donemler listesinden okunur. */
export function yillikAySatirlariOlustur(
  kayitlar: (PuantajOzetSatiri & { tarih: string })[],
  donemler: { ay: number; durum: DonemDurum }[]
): YillikAySatiri[] {
  const donemMap = new Map(donemler.map((d) => [d.ay, d.durum]));
  const gruplar = new Map<number, (PuantajOzetSatiri & { tarih: string })[]>();
  for (const k of kayitlar) {
    const ay = Number(k.tarih.slice(5, 7));
    const liste = gruplar.get(ay) ?? [];
    liste.push(k);
    gruplar.set(ay, liste);
  }

  return Array.from({ length: 12 }, (_, i) => {
    const ay = i + 1;
    const ozet = aySatirOzetiHesapla(gruplar.get(ay) ?? []);
    return {
      ay,
      netSaat: dakikaSaate(ozet.netDakika),
      onayliFmSaat: dakikaSaate(ozet.onayliFmDakika),
      eksikSaat: dakikaSaate(ozet.eksikDakika),
      izinGun: ozet.izinGun,
      devamsizlikGun: ozet.devamsizlikGun,
      donemDurum: donemMap.get(ay) ?? "acik",
    };
  });
}

/** "YYYY-MM-DD" -> "13 Ağu Perş" gibi kısa etiket. */
export function gunEtiket(tarihIso: string): string {
  const [yil, ay, gun] = tarihIso.split("-").map(Number);
  return new Date(Date.UTC(yil, ay - 1, gun, 12)).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  });
}

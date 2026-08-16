import { haftaninGunu } from "@/lib/puantaj";
import type { PersonelPuantajSatir } from "@/types/puantaj";

export type GunKodu = "C" | "FM" | "I" | "R" | "D" | "RT" | "X" | "";

export const GUN_KODU_ETIKETLERI: Record<Exclude<GunKodu, "">, string> = {
  C: "Çalıştı",
  FM: "Fazla Mesai",
  I: "İzinli",
  R: "Raporlu",
  D: "Devamsız",
  RT: "Resmi Tatil",
  X: "Hafta Sonu / Kapalı",
};

export const GUN_KODU_TONLARI: Record<Exclude<GunKodu, "">, "emerald" | "amber" | "sky" | "rose" | "slate"> = {
  C: "emerald",
  FM: "amber",
  I: "sky",
  R: "sky",
  D: "rose",
  RT: "slate",
  X: "slate",
};

/**
 * Bir (personel, tarih) hücresi için tek harfli/iki harfli kodu türetir.
 * Öncelik: gerçek kayıt (varsa) > resmi tatil tablosu > kliniğin kendi hafta
 * sonu ayarı (cumartesi/pazar_baslangic NULL ise o gün kapalı) > boş.
 */
export function gunKoduHesapla(params: {
  kayit: Pick<PersonelPuantajSatir, "durum" | "fazla_mesai_dakika"> | null;
  tarih: string;
  resmiTatilSet: Set<string>;
  cumartesiAcikMi: boolean;
  pazarAcikMi: boolean;
}): GunKodu {
  const { kayit, tarih, resmiTatilSet, cumartesiAcikMi, pazarAcikMi } = params;

  if (kayit) {
    if (kayit.durum === "calisti") return (kayit.fazla_mesai_dakika ?? 0) > 0 ? "FM" : "C";
    if (kayit.durum === "izinli") return "I";
    if (kayit.durum === "raporlu") return "R";
    if (kayit.durum === "gelmedi") return "D";
    if (kayit.durum === "resmi_tatil") return "RT";
  }

  if (resmiTatilSet.has(tarih)) return "RT";

  const gun = haftaninGunu(tarih);
  if (gun === 6 && !cumartesiAcikMi) return "X";
  if (gun === 0 && !pazarAcikMi) return "X";

  return "";
}

export type PuantajSatirToplami = {
  calismaSaat: number;
  fazlaMesaiSaat: number;
  onayliFmSaat: number;
  izinGun: number;
  raporGun: number;
  devamsizGun: number;
  /** Kullanıcı tanımı: devamsız + rapor. */
  eksikGun: number;
};

function yuvarla2(deger: number): number {
  return Math.round(deger * 100) / 100;
}

export function puantajSatirToplamiHesapla(
  kayitlar: Pick<PersonelPuantajSatir, "durum" | "net_calisma_dakika" | "fazla_mesai_dakika" | "fm_onay_durumu">[]
): PuantajSatirToplami {
  let calismaDk = 0;
  let fmDk = 0;
  let onayliFmDk = 0;
  let izinGun = 0;
  let raporGun = 0;
  let devamsizGun = 0;

  for (const k of kayitlar) {
    if (k.net_calisma_dakika != null) calismaDk += k.net_calisma_dakika;
    if (k.fazla_mesai_dakika != null) {
      fmDk += k.fazla_mesai_dakika;
      if (k.fm_onay_durumu === "onaylandi") onayliFmDk += k.fazla_mesai_dakika;
    }
    if (k.durum === "izinli") izinGun += 1;
    if (k.durum === "raporlu") raporGun += 1;
    if (k.durum === "gelmedi") devamsizGun += 1;
  }

  return {
    calismaSaat: yuvarla2(calismaDk / 60),
    fazlaMesaiSaat: yuvarla2(fmDk / 60),
    onayliFmSaat: yuvarla2(onayliFmDk / 60),
    izinGun,
    raporGun,
    devamsizGun,
    eksikGun: devamsizGun + raporGun,
  };
}

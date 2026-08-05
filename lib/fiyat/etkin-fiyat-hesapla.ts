import type { HastaKategori } from "@/types/hasta";

export type KademeliFiyat = {
  vita_fiyat: number;
  plus_fiyat: number | null;
  elit_fiyat: number | null;
  prime_fiyat: number | null;
};

export type IskontoOranlariYuzde = {
  plus_pct: number;
  elit_pct: number;
  prime_pct: number;
};

/**
 * Sunucudaki islem_tanimi_etkin_fiyat() SQL fonksiyonuyla birebir aynı mantık —
 * burası sadece ödeme ekranındaki toplamları önceden göstermek için (RPC zaten
 * kendi içinde bu hesabı bağımsızca tekrarlayıp otoriter fiyatı belirliyor).
 */
export function etkinFiyatHesapla(
  urun: KademeliFiyat,
  kategori: HastaKategori,
  oranlar: IskontoOranlariYuzde | null
): number {
  if (kategori === "vita") return urun.vita_fiyat;

  const override =
    kategori === "plus" ? urun.plus_fiyat : kategori === "elit" ? urun.elit_fiyat : urun.prime_fiyat;
  if (override !== null) return override;

  const pct = oranlar
    ? kategori === "plus"
      ? oranlar.plus_pct
      : kategori === "elit"
        ? oranlar.elit_pct
        : oranlar.prime_pct
    : 0;

  return Math.round(urun.vita_fiyat * (1 - pct / 100) * 100) / 100;
}

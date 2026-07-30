import {
  getCities,
  getDistrictsByCityCode,
  getNeighbourhoodsByCityCodeAndDistrict,
} from "turkey-neighbourhoods";

const turkceSirala = (a: string, b: string) => a.localeCompare(b, "tr");

const ILLER = getCities()
  .map((sehir) => ({ kod: sehir.code, ad: sehir.name }))
  .sort((a, b) => turkceSirala(a.ad, b.ad));

const ilKoduBul = (il: string) => ILLER.find((sehir) => sehir.ad === il)?.kod;

export function getIller(): string[] {
  return ILLER.map((sehir) => sehir.ad);
}

export function getIlceler(il: string): string[] {
  const kod = ilKoduBul(il);
  if (!kod) return [];
  return [...getDistrictsByCityCode(kod)].sort(turkceSirala);
}

export function getMahalleler(il: string, ilce: string): string[] {
  const kod = ilKoduBul(il);
  if (!kod || !ilce) return [];
  return [...getNeighbourhoodsByCityCodeAndDistrict(kod, ilce)].sort(turkceSirala);
}

import type { PaketSatir } from "@/types/paket";

export function satisSuresiDoldu(tarih: string): boolean {
  const bugun = new Date().toISOString().slice(0, 10);
  return tarih < bugun;
}

export function paketArsivdeMi(paket: Pick<PaketSatir, "satis_bitis_tarihi">): boolean {
  return paket.satis_bitis_tarihi ? satisSuresiDoldu(paket.satis_bitis_tarihi) : false;
}

export function satisEngelliMi(paket: Pick<PaketSatir, "aktif" | "satis_bitis_tarihi">): boolean {
  if (!paket.aktif) return true;
  return paketArsivdeMi(paket);
}

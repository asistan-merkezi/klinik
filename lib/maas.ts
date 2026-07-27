import type { MaasHesaplamaModeli } from "@/types/personel";

export type MaasHesapParametreleri = {
  maas_hesaplama_modeli: MaasHesaplamaModeli;
  sabit_maas: number | null;
  prim_sabit_tutar: number | null;
  baraj_seans_sayisi: number | null;
  baraj_bonus_tutari: number | null;
};

export type MaasHesapSonucu = {
  taban: number;
  prim: number;
  ekstra_toplam: number;
  toplam: number;
  aciklama: string;
};

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function maasHesapla(
  parametreler: MaasHesapParametreleri,
  tamamlananSeansSayisi: number,
  ekstraHakedisToplami: number
): MaasHesapSonucu {
  const taban = parametreler.sabit_maas ?? 0;
  let prim = 0;
  let aciklama = "Sabit maaş";

  if (parametreler.maas_hesaplama_modeli === "islem_basi_prim") {
    const birimPrim = parametreler.prim_sabit_tutar ?? 0;
    prim = tamamlananSeansSayisi * birimPrim;
    aciklama = `Sabit maaş + ${tamamlananSeansSayisi} seans × ${paraFormat(birimPrim)} prim`;
  } else if (parametreler.maas_hesaplama_modeli === "barajli_prim") {
    const baraj = parametreler.baraj_seans_sayisi ?? 0;
    const bonus = parametreler.baraj_bonus_tutari ?? 0;
    const barajAsildi = tamamlananSeansSayisi > baraj;
    prim = barajAsildi ? bonus : 0;
    aciklama = barajAsildi
      ? `Sabit maaş + baraj (${baraj} seans) aşıldı, ${paraFormat(bonus)} bonus eklendi`
      : `Sabit maaş, baraj (${baraj} seans) aşılmadı — bonus yok`;
  }

  return {
    taban,
    prim,
    ekstra_toplam: ekstraHakedisToplami,
    toplam: taban + prim + ekstraHakedisToplami,
    aciklama,
  };
}

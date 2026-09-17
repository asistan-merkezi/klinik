import type { MaasHesaplamaModeli } from "@/types/personel";

export type MaasHesapParametreleri = {
  maas_hesaplama_modeli: MaasHesaplamaModeli;
  sabit_maas: number | null;
  prim_sabit_tutar: number | null;
  baraj_seans_sayisi: number | null;
  baraj_bonus_tutari: number | null;
  /**
   * Kısmi ay oranlaması için — dönemin (hesaplanan ayın) tarih aralığı +
   * personelin işe giriş/çıkış tarihleri. Hepsi verilirse taban maaş, o ay
   * fiilen çalışılan gün / ayın toplam gün sayısı oranına göre kesilir.
   * Herhangi biri eksikse (ör. eski çağrı yerleri) oranlama uygulanmaz —
   * geriye dönük uyumlu.
   */
  ayBaslangicTarih?: string; // YYYY-MM-DD, ayın 1'i
  ayBitisTarihExclusive?: string; // YYYY-MM-DD, bir sonraki ayın 1'i
  iseGirisTarihi?: string | null;
  istenCikisTarihi?: string | null;
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

const GUN_MS = 24 * 60 * 60 * 1000;

/**
 * Dönem içinde fiilen çalışılan gün sayısı / ayın toplam gün sayısı.
 * İşe giriş ayın 1'inden sonraysa veya işten çıkış ay bitmeden olduysa
 * 1'den küçük döner; aksi halde (tam ay) 1 döner.
 */
function kismiAyOrani(
  ayBaslangicTarih: string,
  ayBitisTarihExclusive: string,
  iseGirisTarihi: string | null | undefined,
  istenCikisTarihi: string | null | undefined
): { oran: number; calisilanGun: number; toplamGun: number } {
  const ayBaslangic = Date.parse(`${ayBaslangicTarih}T00:00:00Z`);
  const ayBitisExclusive = Date.parse(`${ayBitisTarihExclusive}T00:00:00Z`);
  const toplamGun = Math.round((ayBitisExclusive - ayBaslangic) / GUN_MS);

  let etkinBaslangic = ayBaslangic;
  if (iseGirisTarihi) {
    const giris = Date.parse(`${iseGirisTarihi}T00:00:00Z`);
    if (giris > etkinBaslangic) etkinBaslangic = giris;
  }

  // Çıkış günü son çalışılan gün sayılır (dahil) -> exclusive uç = çıkış + 1 gün.
  let etkinBitisExclusive = ayBitisExclusive;
  if (istenCikisTarihi) {
    const cikisExclusive = Date.parse(`${istenCikisTarihi}T00:00:00Z`) + GUN_MS;
    if (cikisExclusive < etkinBitisExclusive) etkinBitisExclusive = cikisExclusive;
  }

  const calisilanGun = Math.max(0, Math.round((etkinBitisExclusive - etkinBaslangic) / GUN_MS));
  if (toplamGun <= 0) return { oran: 1, calisilanGun: 0, toplamGun: 0 };
  return { oran: Math.min(1, calisilanGun / toplamGun), calisilanGun, toplamGun };
}

export function maasHesapla(
  parametreler: MaasHesapParametreleri,
  tamamlananSeansSayisi: number,
  ekstraHakedisToplami: number
): MaasHesapSonucu {
  const sabitMaas = parametreler.sabit_maas ?? 0;
  let taban = sabitMaas;
  let kismiAciklama = "";

  if (parametreler.ayBaslangicTarih && parametreler.ayBitisTarihExclusive) {
    const { oran, calisilanGun, toplamGun } = kismiAyOrani(
      parametreler.ayBaslangicTarih,
      parametreler.ayBitisTarihExclusive,
      parametreler.iseGirisTarihi,
      parametreler.istenCikisTarihi
    );
    if (oran < 1) {
      taban = Math.round(sabitMaas * oran * 100) / 100;
      kismiAciklama = ` (${calisilanGun}/${toplamGun} gün oranlı)`;
    }
  }

  let prim = 0;
  let aciklama = `Sabit maaş${kismiAciklama}`;

  if (parametreler.maas_hesaplama_modeli === "islem_basi_prim") {
    const birimPrim = parametreler.prim_sabit_tutar ?? 0;
    prim = tamamlananSeansSayisi * birimPrim;
    aciklama = `Sabit maaş${kismiAciklama} + ${tamamlananSeansSayisi} seans × ${paraFormat(birimPrim)} prim`;
  } else if (parametreler.maas_hesaplama_modeli === "barajli_prim") {
    const baraj = parametreler.baraj_seans_sayisi ?? 0;
    const bonus = parametreler.baraj_bonus_tutari ?? 0;
    const barajAsildi = tamamlananSeansSayisi > baraj;
    prim = barajAsildi ? bonus : 0;
    aciklama = barajAsildi
      ? `Sabit maaş${kismiAciklama} + baraj (${baraj} seans) aşıldı, ${paraFormat(bonus)} bonus eklendi`
      : `Sabit maaş${kismiAciklama}, baraj (${baraj} seans) aşılmadı — bonus yok`;
  }

  return {
    taban,
    prim,
    ekstra_toplam: ekstraHakedisToplami,
    toplam: taban + prim + ekstraHakedisToplami,
    aciklama,
  };
}

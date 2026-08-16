import { maasHesapla, type MaasHesapParametreleri } from "@/lib/maas";

/**
 * Puantaj Cetveli'nin "Hakediş (₺)" kolonu için TEK kaynak — hiçbir UI
 * bileşeni bu formülü kendi başına tekrarlamamalı.
 *
 * Dönem KAPALI ise: personel_hesap_hareket'e zaten yazılmış gerçek
 * (hakedis+prim+mesai) satırların toplamı döner — bu artık değişmeyen,
 * gerçekleşmiş bir kayıt (bkz. personel_puantaj_donem_kapat RPC'si).
 *
 * Dönem AÇIK ise: personel_puantaj_donem_kapat RPC'sinin şu an kapatılsaydı
 * yazacağı tutarla BİREBİR aynı formülle canlı bir tahmin hesaplanır (taban+
 * prim maasHesapla()'dan, mesai = fm_saatlik_ucret × onaylı FM saat).
 */

export type HakedisGirdisi = {
  personelMaasi: number | null;
  fmSaatlikUcret: number | null;
  /** null ise terapist değil (sabit maaş dışında prim modeli uygulanmaz). */
  terapistAyarlari: {
    maas_hesaplama_modeli: MaasHesapParametreleri["maas_hesaplama_modeli"];
    prim_sabit_tutar: number | null;
    baraj_seans_sayisi: number | null;
    baraj_bonus_tutari: number | null;
  } | null;
  tamamlananSeansSayisi: number;
  onayliFmSaat: number;
};

export type HakedisSonucu = {
  taban: number;
  prim: number;
  mesai: number;
  toplam: number;
  /** "ledger": dönem kapalı, gerçekleşmiş kayıt; "tahmini": dönem açık, canlı hesap. */
  kaynak: "ledger" | "tahmini";
};

function yuvarla2(deger: number): number {
  return Math.round(deger * 100) / 100;
}

export function hakedisHesapla(girdi: HakedisGirdisi): HakedisSonucu {
  const parametreler: MaasHesapParametreleri = girdi.terapistAyarlari
    ? {
        maas_hesaplama_modeli: girdi.terapistAyarlari.maas_hesaplama_modeli,
        sabit_maas: girdi.personelMaasi,
        prim_sabit_tutar: girdi.terapistAyarlari.prim_sabit_tutar,
        baraj_seans_sayisi: girdi.terapistAyarlari.baraj_seans_sayisi,
        baraj_bonus_tutari: girdi.terapistAyarlari.baraj_bonus_tutari,
      }
    : { maas_hesaplama_modeli: "sabit", sabit_maas: girdi.personelMaasi, prim_sabit_tutar: null, baraj_seans_sayisi: null, baraj_bonus_tutari: null };

  const hesap = maasHesapla(parametreler, girdi.tamamlananSeansSayisi, 0);
  const mesai = yuvarla2((girdi.fmSaatlikUcret ?? 0) * girdi.onayliFmSaat);

  return {
    taban: hesap.taban,
    prim: hesap.prim,
    mesai,
    toplam: yuvarla2(hesap.taban + hesap.prim + mesai),
    kaynak: "tahmini",
  };
}

/** Dönem kapalıysa personel_hesap_hareket'teki gerçek toplamı (hakedis+prim+mesai) döndürür. */
export function hakedisKapaliDonemToplami(satirlar: { tur: string; tutar: number }[]): HakedisSonucu {
  let taban = 0;
  let prim = 0;
  let mesai = 0;
  for (const s of satirlar) {
    if (s.tur === "hakedis") taban += s.tutar;
    else if (s.tur === "prim") prim += s.tutar;
    else if (s.tur === "mesai") mesai += s.tutar;
  }
  return { taban, prim, mesai, toplam: yuvarla2(taban + prim + mesai), kaynak: "ledger" };
}

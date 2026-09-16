export type NakitBankaHareketTipi = "giden" | "gelen" | "hesaplar_arasi";

/** Sadece tip='gelen' VE hedef banka iken anlamlı — bankaya nakit yatırma mı havale mi geldiği ayrımı. */
export type NakitBankaOdemeYontemi = "nakit" | "banka_havalesi";

export type NakitBankaHareketi = {
  id: string;
  klinik_id: string;
  tip: NakitBankaHareketTipi;
  kaynak_kasa: boolean;
  kaynak_banka_hesap_id: string | null;
  hedef_kasa: boolean;
  hedef_banka_hesap_id: string | null;
  odeme_yontemi: NakitBankaOdemeYontemi | null;
  karsi_taraf_adi: string | null;
  karsi_taraf_banka: string | null;
  karsi_taraf_iban: string | null;
  aciklama: string | null;
  tutar: number;
  tarih: string;
  ekleyen_kullanici_id: string | null;
  created_at: string;
};

/** LedgerView'ın beklediği normalize satır şekli — Kasa/Banka sayfaları tüm kaynakları buna dönüştürür. */
export type LedgerSatiri = {
  tarih: string;
  tutar: number;
  etiket: string;
  taraf?: string;
};

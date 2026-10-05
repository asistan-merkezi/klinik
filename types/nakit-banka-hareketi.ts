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

/**
 * LedgerView'ın beklediği normalize satır şekli — Kasa/Banka/Kredi Kartı sayfaları tüm
 * kaynakları buna dönüştürür. `tarih` HER ZAMAN İstanbul takvim günü ("YYYY-MM-DD").
 */
export type LedgerSatiri = {
  /** React key + silme hedefi (kaynak tablodaki id) */
  id: string;
  tarih: string;
  tutar: number;
  /** "Tür" sütunu: Hasta ödemesi, Gider, Personel avansı, Kasa Dengeleme, ... */
  etiket: string;
  /** "Karşı Taraf" sütunu */
  taraf?: string;
  aciklama?: string;
  /** Doluysa satırda silme ikonu çıkar — yalnız manuel kayıtlar (nakit_banka_hareketi / kasa_dengeleme). */
  sil?: { hedef: "nakit_banka_hareketi" | "kasa_dengeleme"; id: string };
};

export type OdemeYontemi = "kredi_karti" | "banka_havalesi" | "nakit";

export const YONTEM_ETIKETLERI: Record<OdemeYontemi, string> = {
  nakit: "Nakit",
  kredi_karti: "Kredi Kartı",
  banka_havalesi: "Banka Havalesi",
};

export type SatilabilirUrun = {
  id: string;
  ad: string;
  tur: "islem" | "paket";
  fiyat: number;
  kdv_orani: number;
};

export type PaketSatisSatir = {
  id: string;
  kalan_adet: number;
  gecerlilik_bitis_tarihi: string;
  durum: string;
  paket: { ad: string; seans_sayisi: number } | null;
};

export type FaturaDurumu = "bekliyor" | "kesildi" | "hata";

export type FaturaSatir = {
  id: string;
  durum: FaturaDurumu;
  e_arsiv_pdf_url: string | null;
  hata_mesaji: string | null;
};

export type OdemeGecmisSatir = {
  id: string;
  created_at: string;
  iskonto_tutari: number;
  faturali: boolean;
  odeme_kalemi: {
    miktar: number;
    birim_fiyat: number;
    islem_tanimi: { ad: string } | null;
    paket_satis: { paket: { ad: string } | null } | null;
  }[];
  odeme_satiri: { yontem: OdemeYontemi; tutar: number }[];
  fatura: FaturaSatir[];
};

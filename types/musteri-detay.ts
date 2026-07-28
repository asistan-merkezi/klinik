export type RiskSeviyesi = "yuksek" | "orta" | "dusuk";

export type RiskTipi =
  | "alerji"
  | "kalp_pili"
  | "kan_sulandirici"
  | "dusme_riski"
  | "hamilelik"
  | "diyabet"
  | "epilepsi"
  | "metal_implant"
  | "diger";

export type RiskBayragi = {
  tip: RiskTipi;
  aciklama: string;
  seviye: RiskSeviyesi;
  eklenme_tarihi: string;
  ekleyen_id: string | null;
};

export const RISK_TIPI_ETIKETLERI: Record<RiskTipi, string> = {
  alerji: "Alerji",
  kalp_pili: "Kalp Pili",
  kan_sulandirici: "Kan Sulandırıcı",
  dusme_riski: "Düşme Riski",
  hamilelik: "Hamilelik",
  diyabet: "Diyabet",
  epilepsi: "Epilepsi",
  metal_implant: "Metal İmplant",
  diger: "Diğer",
};

export type MusteriOzet = {
  musteri_id: string;
  klinik_id: string;
  son_vas_skoru: number | null;
  son_vas_tarihi: string | null;
  aktif_hedef_sayisi: number;
  kalan_paket_hakki: number;
  bakiye: number;
  son_seans_tarihi: string | null;
  aktif_risk_bayrak_sayisi: number;
  no_show_sayisi: number;
};

export type HedefTipi = "vas" | "rom" | "fonksiyonel" | "serbest";
export type HedefDurumu = "aktif" | "ulasildi" | "basarisiz" | "iptal";

export type MusteriHedef = {
  id: string;
  musteri_id: string;
  hedef_tipi: HedefTipi;
  hedef_metrik: string;
  baslangic_deger: number | null;
  hedef_deger: number | null;
  hedef_tarihi: string | null;
  durum: HedefDurumu;
  olusturan_id: string | null;
  notlar: string | null;
  created_at: string;
};

export const HEDEF_TIPI_ETIKETLERI: Record<HedefTipi, string> = {
  vas: "VAS (Ağrı)",
  rom: "ROM (Eklem Hareket Açıklığı)",
  fonksiyonel: "Fonksiyonel",
  serbest: "Serbest",
};

export const HEDEF_DURUM_ETIKETLERI: Record<HedefDurumu, string> = {
  aktif: "Aktif",
  ulasildi: "Ulaşıldı",
  basarisiz: "Başarısız",
  iptal: "İptal",
};

export type YorumYonu = "yuksek_iyi" | "dusuk_iyi";

export type OlcekTanimi = {
  id: string;
  kod: string;
  ad: string;
  min_skor: number | null;
  max_skor: number | null;
  yorum_yonu: YorumYonu;
};

export type MusteriOlcum = {
  id: string;
  musteri_id: string;
  olcek_tanimi_id: string;
  hesaplanan_skor: number | null;
  olcum_tarihi: string;
  cevaplar: Record<string, unknown>;
  olcek_tanimi: OlcekTanimi | null;
};

export type IliskiTuru = "ebeveyn" | "cocuk" | "es" | "kardes" | "diger";

export const ILISKI_TURU_ETIKETLERI: Record<IliskiTuru, string> = {
  ebeveyn: "Ebeveyn",
  cocuk: "Çocuk",
  es: "Eş",
  kardes: "Kardeş",
  diger: "Diğer",
};

export type MusteriIliski = {
  id: string;
  musteri_id: string;
  iliskili_musteri_id: string;
  iliski_turu: IliskiTuru;
  ortak_odeme: boolean;
  iliskili_musteri: { ad_soyad: string; telefon: string } | null;
};

export type MusteriSigorta = {
  id: string;
  musteri_id: string;
  kurum_adi: string;
  police_no: string | null;
  katilim_payi_orani: number | null;
  gecerlilik_baslangic: string | null;
  gecerlilik_bitis: string | null;
  fatura_kurum_adina: boolean;
  notlar: string | null;
};

export type UyariSeviyesi = "blok" | "uyari";

export type IslemKontrendikasyon = {
  id: string;
  islem_tanimi_id: string;
  risk_tipi: RiskTipi;
  uyari_seviyesi: UyariSeviyesi;
  mesaj: string;
};

export type ProtokolDurumu = "aktif" | "tamamlandi" | "iptal";

export type MusteriProtokol = {
  id: string;
  musteri_id: string;
  islem_tanimi_id: string;
  durum: ProtokolDurumu;
  baslangic_tarihi: string;
  notlar: string | null;
  uyari_onaylandi_mi: boolean;
  islem_tanimi: { ad: string } | null;
};

export type VucutHaritasiIsareti = {
  id: string;
  musteri_id: string;
  bolge: string;
  x: number;
  y: number;
  severity: number | null;
  not_metni: string | null;
  created_at: string;
};

export type VucutBolgeKodu =
  | "boyun"
  | "omuz_sag"
  | "omuz_sol"
  | "dirsek_sag"
  | "dirsek_sol"
  | "el_bilek_sag"
  | "el_bilek_sol"
  | "gogus"
  | "karin"
  | "bel"
  | "kalca"
  | "diz_sag"
  | "diz_sol"
  | "ayak_bilegi_sag"
  | "ayak_bilegi_sol"
  | "sirt_ust"
  | "sirt_alt";

export const VUCUT_BOLGE_ETIKETLERI: Record<VucutBolgeKodu, string> = {
  boyun: "Boyun",
  omuz_sag: "Omuz (Sağ)",
  omuz_sol: "Omuz (Sol)",
  dirsek_sag: "Dirsek (Sağ)",
  dirsek_sol: "Dirsek (Sol)",
  el_bilek_sag: "El Bileği (Sağ)",
  el_bilek_sol: "El Bileği (Sol)",
  gogus: "Göğüs",
  karin: "Karın",
  bel: "Bel",
  kalca: "Kalça",
  diz_sag: "Diz (Sağ)",
  diz_sol: "Diz (Sol)",
  ayak_bilegi_sag: "Ayak Bileği (Sağ)",
  ayak_bilegi_sol: "Ayak Bileği (Sol)",
  sirt_ust: "Sırt (Üst)",
  sirt_alt: "Sırt (Alt)",
};

export type BakiyeHareketTuru = "odeme" | "iade" | "kredi" | "borc";

export const BAKIYE_HAREKET_ETIKETLERI: Record<BakiyeHareketTuru, string> = {
  odeme: "Ödeme",
  iade: "İade",
  kredi: "Kredi",
  borc: "Borç",
};

export type MusteriBakiyeHareket = {
  id: string;
  tur: BakiyeHareketTuru;
  tutar: number;
  aciklama: string | null;
  created_at: string;
};

export type MusteriKarsilastirma = {
  karsilastirma_grubu_id: string;
  belge_id: string;
  bolge: string | null;
  asama: "tedavi_oncesi" | "ara_kontrol" | "tedavi_sonrasi" | null;
  cekim_tarihi: string;
  storage_path: string;
  thumbnail_path: string | null;
};

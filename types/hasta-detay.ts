import type { StatusTone } from "@/components/ui/status-badge";
import type { OdemeYontemi } from "@/types/odeme";

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

export type HastaOzet = {
  hasta_id: string;
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

export type HastaDetayOzet = HastaOzet & {
  sonraki_randevu_tarihi: string | null;
  aktif_protokol_ad: string | null;
  olcum_sayisi: number;
  belge_sayisi: number;
  son_iletisim_tarihi: string | null;
};

export type HedefTipi = "vas" | "rom" | "fonksiyonel" | "serbest";
export type HedefDurumu = "aktif" | "ulasildi" | "basarisiz" | "iptal";

export type HastaHedef = {
  id: string;
  hasta_id: string;
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

export type HastaOlcum = {
  id: string;
  hasta_id: string;
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

export type HastaIliski = {
  id: string;
  hasta_id: string;
  iliskili_hasta_id: string;
  iliski_turu: IliskiTuru;
  ortak_odeme: boolean;
  iliskili_hasta: { ad_soyad: string; telefon: string } | null;
};

export type HastaSigorta = {
  id: string;
  hasta_id: string;
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

export type HastaProtokol = {
  id: string;
  hasta_id: string;
  islem_tanimi_id: string;
  durum: ProtokolDurumu;
  baslangic_tarihi: string;
  notlar: string | null;
  uyari_onaylandi_mi: boolean;
  islem_tanimi: { ad: string } | null;
};

// Bölge kodu sabitleri ve etiketleri artık lib/vucut-bolgeleri.ts'te
// (VUCUT_BOLGELERI / VUCUT_BOLGE_ETIKETLERI) — ön/arka ayrımlı yeni harita.
export type VucutHaritasiIsareti = {
  id: string;
  hasta_id: string;
  randevu_id: string | null;
  yuz: "on" | "arka";
  bolge: string;
  x: number | null;
  y: number | null;
  severity: number | null;
  not_metni: string | null;
  created_at: string;
};

export type RandevuDurumu =
  | "planlandi"
  | "geldi"
  | "gecikmeli_geldi"
  | "gelmedi"
  | "ertelendi"
  | "iptal"
  | "tamamlandi";

export const RANDEVU_DURUM_ETIKETLERI: Record<RandevuDurumu, string> = {
  planlandi: "Planlandı",
  geldi: "Geldi",
  gecikmeli_geldi: "Gecikmeli Geldi",
  gelmedi: "Gelmedi",
  ertelendi: "Ertelendi",
  iptal: "İptal",
  tamamlandi: "Tamamlandı",
};

export const RANDEVU_DURUM_TONLARI: Record<RandevuDurumu, StatusTone> = {
  planlandi: "primary",
  geldi: "emerald",
  gecikmeli_geldi: "emerald",
  iptal: "rose",
  gelmedi: "rose",
  ertelendi: "sky",
  tamamlandi: "slate",
};

export type HastaSeansSatir = {
  id: string;
  baslangic: string;
  bitis: string;
  durum: RandevuDurumu;
  terapist: { personel: { ad_soyad: string } | null } | null;
  islem_tanimi: { ad: string } | null;
  tani: string | null;
  antrenor: { ad_soyad: string } | null;
  tedavi_protokolu: { id: string; ad: string } | null;
  tamamlanma_aciklamasi: string | null;
  tamamlayan_kullanici: { ad_soyad: string } | null;
  tamamlanma_tarihi: string | null;
  degerlendirme?: { puan: number | null; oneri_metni: string | null } | null;
};

export type BakiyeHareketTuru = "odeme" | "iade" | "kredi" | "borc";

export const BAKIYE_HAREKET_ETIKETLERI: Record<BakiyeHareketTuru, string> = {
  odeme: "Ödeme",
  iade: "İade",
  kredi: "Kredi",
  borc: "Borç",
};

export type HastaBakiyeHareketRandevu = {
  terapist: { personel: { ad_soyad: string } | null } | null;
  islem_tanimi: { ad: string; vita_fiyat: number } | null;
};

export type HastaBakiyeHareketOdemeKalemi = {
  miktar: number;
  birim_fiyat: number;
  islem_tanimi: { ad: string; vita_fiyat: number } | null;
  paket_satis: { paket: { ad: string } | null } | null;
};

export type HastaBakiyeHareketOdeme = {
  created_at: string;
  iskonto_tutari: number;
  odeme_kalemi: HastaBakiyeHareketOdemeKalemi[];
  odeme_satiri: { yontem: OdemeYontemi }[];
};

export type HastaBakiyeHareket = {
  id: string;
  tur: BakiyeHareketTuru;
  tutar: number;
  aciklama: string | null;
  created_at: string;
  odeme_id: string | null;
  randevu: HastaBakiyeHareketRandevu | null;
  odeme: HastaBakiyeHareketOdeme | null;
};

export type HastaKarsilastirma = {
  karsilastirma_grubu_id: string;
  belge_id: string;
  bolge: string | null;
  asama: "tedavi_oncesi" | "ara_kontrol" | "tedavi_sonrasi" | null;
  cekim_tarihi: string;
  storage_path: string;
  thumbnail_path: string | null;
};

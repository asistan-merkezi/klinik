import type { RiskBayragi } from "./hasta-detay";

export type Cinsiyet = "kadin" | "erkek" | "belirtilmemis";
export type HastaKategori = "vita" | "plus" | "elit" | "prime";

export type HastaSatir = {
  id: string;
  ad_soyad: string;
  telefon: string;
  dogum_tarihi: string | null;
  kvkk_onay_tarihi: string | null;
  whatsapp_izin_durumu: boolean;
};

// Hastalar listesi (/panel/hastalar) satırı — cari borç noktası ve eksik
// bilgi rozeti için HastaSatir'in üstüne eklenen alanlar. `bakiye` hasta
// tablosundan değil ayrı bir v_hasta_ozet sorgusundan gelip sayfada
// birleştiriliyor (view'ın kendi FK ilişkisi olmadığı için embed edilemiyor).
export type HastaListeSatiri = HastaSatir & {
  eposta: string | null;
  hasta_hassas: { adres: string | null } | null;
  bakiye: number;
};

export type OnaylayanTip = "hasta" | "personel";

export type HastaDetay = HastaSatir & {
  cinsiyet: Cinsiyet | null;
  kategori: HastaKategori;
  eposta: string | null;
  referans_kanali: string | null;
  ozel_nitelikli_veri_onay_tarihi: string | null;
  ticari_ileti_onay_tarihi: string | null;
  risk_bayraklari: RiskBayragi[];
  kvkk_onaylayan_tip: OnaylayanTip | null;
  kvkk_onaylayan: { ad_soyad: string } | null;
  ozel_nitelikli_onaylayan_tip: OnaylayanTip | null;
  ozel_nitelikli_onaylayan: { ad_soyad: string } | null;
  ticari_ileti_onaylayan_tip: OnaylayanTip | null;
  ticari_ileti_onaylayan: { ad_soyad: string } | null;
  /** Sadece bu iki alanı seçen sorgularda dolu gelir (bkz. Portal Bilgilerim). */
  updated_at?: string;
  son_guncelleyen_tip?: OnaylayanTip | null;
};

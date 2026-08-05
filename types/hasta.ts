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
};

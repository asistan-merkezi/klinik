import type { RiskBayragi } from "./hasta-detay";

export type Cinsiyet = "kadin" | "erkek" | "belirtilmemis";

export type HastaSatir = {
  id: string;
  ad_soyad: string;
  telefon: string;
  dogum_tarihi: string | null;
  kvkk_onay_tarihi: string | null;
  whatsapp_izin_durumu: boolean;
};

export type HastaDetay = HastaSatir & {
  cinsiyet: Cinsiyet | null;
  eposta: string | null;
  referans_kanali: string | null;
  ozel_nitelikli_veri_onay_tarihi: string | null;
  ticari_ileti_onay_tarihi: string | null;
  risk_bayraklari: RiskBayragi[];
};

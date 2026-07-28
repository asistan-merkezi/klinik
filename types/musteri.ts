import type { RiskBayragi } from "./musteri-detay";

export type Cinsiyet = "kadin" | "erkek" | "belirtilmemis";

export type MusteriSatir = {
  id: string;
  ad_soyad: string;
  telefon: string;
  dogum_tarihi: string | null;
  kvkk_onay_tarihi: string | null;
  whatsapp_izin_durumu: boolean;
};

export type MusteriDetay = MusteriSatir & {
  cinsiyet: Cinsiyet | null;
  eposta: string | null;
  referans_kanali: string | null;
  ozel_nitelikli_veri_onay_tarihi: string | null;
  ticari_ileti_onay_tarihi: string | null;
  risk_bayraklari: RiskBayragi[];
};

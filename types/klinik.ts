export type SirketBilgileri = {
  unvan: string | null;
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
  adres: string | null;
  vergi_dairesi: string | null;
  vergi_no: string | null;
  telefon: string | null;
  whatsapp_no: string | null;
  eposta: string | null;
  yetkili_kisi: string | null;
  yetkili_telefon: string | null;
  yetkili_eposta: string | null;
  logo_url: string | null;
  logo_url_koyu: string | null;
  hafta_ici_baslangic: string | null;
  hafta_ici_bitis: string | null;
  cumartesi_baslangic: string | null;
  cumartesi_bitis: string | null;
  pazar_baslangic: string | null;
  pazar_bitis: string | null;
};

/** Kapı tableti gibi minimal marka-kimliği bağlamlarında kullanılan alan alt kümesi. */
export type Klinik = {
  ad: string;
  logo_url: string | null;
  logo_url_koyu: string | null;
  marka_renkleri: { primary?: string } | null;
};

export type KlinikArac = {
  id: string;
  marka: string;
  model: string;
  plaka: string;
};

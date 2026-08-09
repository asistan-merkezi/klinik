export type TabletTemasi = "acik" | "koyu";

export type TabletAyarlari = {
  hasta_adi_goster: boolean;
  terapist_adi_goster: boolean;
  islem_adi_goster: boolean;
  durum_rengi_goster: boolean;
  soyad_maskele: boolean;
  tema: TabletTemasi;
};

export const VARSAYILAN_TABLET_AYARLARI: TabletAyarlari = {
  hasta_adi_goster: true,
  terapist_adi_goster: true,
  islem_adi_goster: true,
  durum_rengi_goster: true,
  soyad_maskele: false,
  tema: "koyu",
};

/** Tüm mesaj sağlayıcı adapter'larının uyduğu tek arayüz. */
export type MesajGonderGirdi = {
  aliciAdres: string;
  metin: string;
};

export type MesajGonderSonucu =
  | { basarili: true; saglayiciMesajId?: string }
  | { basarili: false; hata: string; kalici?: boolean };

export type MesajSaglayici = {
  gonder(girdi: MesajGonderGirdi): Promise<MesajGonderSonucu>;
};

export type RandevuDurum =
  | "planlandi"
  | "geldi"
  | "gecikmeli_geldi"
  | "gelmedi"
  | "ertelendi"
  | "iptal"
  | "tamamlandi";

// Randevu Çizelgesi satırı — select'i lib/randevu/queries.ts > RANDEVU_SELECT'te
// TEK yerde tanımlı; oraya kolon ekleyince bu tipi de güncelle.
export type RandevuSatir = {
  id: string;
  baslangic: string;
  bitis: string;
  durum: RandevuDurum;
  gecikme_dakika?: number | null;
  hasta: { ad_soyad: string } | null;
  oda: { ad: string } | null;
  terapist: { personel: { ad_soyad: string } | null } | null;
  created_at?: string;
  olusturan_kullanici?: { ad_soyad: string } | null;
  hasta_id?: string;
  terapist_id?: string;
  oda_id?: string;
  cihaz_id?: string | null;
  islem_tanimi?: { id: string; ad: string } | null;
  tani?: string | null;
  antrenor_id?: string | null;
  antrenor?: { ad_soyad: string } | null;
  tedavi_protokolu_id?: string | null;
  tedavi_protokolu?: { id: string; ad: string } | null;
  kaynak?: "uygulama" | "arsiv";
  tamamlanma_aciklamasi?: string | null;
  /** İptal bilgisi (bkz. randevu_iptal_et): sebep, geç iptal (18 saatten az kala → seans sayıldı), paketten düşüldü mü. */
  iptal_aciklamasi?: string | null;
  iptal_tarihi?: string | null;
  gec_iptal?: boolean;
  iptal_paket_dusuldu?: boolean;
  /** Personelin seçtiği bedelli iptal (paketten düşer / paketsizse bakiyeye borç). */
  bedelli_iptal?: boolean;
  iptal_borc_yazildi?: boolean;
  tamamlanma_tarihi?: string | null;
  tamamlayan_kullanici?: { ad_soyad: string } | null;
  /** Check-in'de bir paketten düşüldüyse dolu (bkz. randevu_gelis_isaretle). */
  paket_satis_id?: string | null;
  /**
   * Bağlı paket satışının güncel kalan hakkı + paket adı — tamamlanan seans
   * özetinde "paket bitmek üzere" uyarısı için (bkz. lib/paket/yenileme-esigi.ts).
   * Kalan hak check-in'de düşer, bu yüzden tamamlanma anında zaten güncel.
   */
  paket_satis?: { kalan_adet: number; paket: { ad: string } | null } | null;
  /**
   * Bu randevuya bağlı hasta_bakiye_hareket satırları (yalnız id+tur) — seans
   * tamamlandıktan sonra "Cariye Ekle"/"Ödeme Ekle" ile bir 'borc' satırı
   * yazılıp yazılmadığını anlamak için (bkz. randevu-kutusu.tsx'teki kutu
   * rengi ve randevu-detay-paneli.tsx'teki "İşlem kapanmıştır" durumu).
   * Check-in artık borç yazmıyor (2026-09-27) — bu alan yalnız seans
   * tamamlandıktan SONRA oluşan satırları görür.
   */
  hasta_bakiye_hareket?: { id: string; tur: string }[];
};

export type SecenekSatir = {
  id: string;
  ad: string;
};

/**
 * Tedavi seçim listesi — Süre alanının otomatik dolması için sure_dakika,
 * Personel seçiciyi daraltmak için de adımlarında tanımlı "uygulayıcı"
 * pozisyon id'lerini taşır (bkz. randevu-formu.tsx). Hiçbir adımda pozisyon
 * tanımlı değilse pozisyon_idleri boş dizi döner = filtre uygulanmaz.
 */
export type TedaviAdimSatir = {
  ad: string;
  sure_dakika: number | null;
  cihaz_id: string | null;
  cihaz_ad: string | null;
};

export type TedaviSecenekSatir = SecenekSatir & {
  sure_dakika: number | null;
  pozisyon_idleri: string[];
  /** Tedavi Tanımları'ndaki işlem adımları (sira sırasıyla) — randevu formunda "Yapılacak İşlemler" olarak gösterilir. */
  adimlar: TedaviAdimSatir[];
};

/** Terapist seçim listesi — Tedavi seçilince Personel seçiciyi o tedavinin gerektirdiği pozisyona daraltmak için pozisyon_id taşır (bkz. randevu-formu.tsx). */
export type TerapistSecenekSatir = SecenekSatir & {
  pozisyon_id: string | null;
};

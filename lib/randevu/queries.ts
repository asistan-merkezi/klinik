/**
 * Randevu Çizelgesi'nin randevu satırı select'i — TEK KAYNAK.
 *
 * Üç yerde kullanılır ve birebir aynı olmak ZORUNDA:
 *   - app/(app)/panel/page.tsx            (ana panel ilk yükleme)
 *   - app/(app)/panel/randevular/page.tsx (Randevular sayfası ilk yükleme)
 *   - components/panel/canli-cizelge.tsx  (realtime yenilemesi)
 * Biri diğerlerinden farklıysa yeni bir kolon ilk sunucu yüklemesinde görünüp
 * ilk realtime yenilemesinde sessizce kaybolur (2026-09-27'de `tamamlanma_*`
 * ile yaşandı; `tsc` düz string'i yakalamaz). Bu yüzden hiçbir yerde elle
 * yazılmaz, buradan import edilir.
 *
 * Bu string'e kolon/embed eklerken `types/randevu.ts > RandevuSatir` tipini de
 * güncelle — dönen satırın şekli orada tanımlı (`.returns<RandevuSatir[]>()`).
 *
 * Bilinçli olarak burada OLMAYANLAR: Hasta Detayı (`hastalar/[id]`), tablet ve
 * portal kendi, daha dar select'lerini kullanır — farklı ekranlar, farklı şekil.
 */
export const RANDEVU_SELECT =
  "id, baslangic, bitis, durum, gecikme_dakika, hasta_id, terapist_id, oda_id, cihaz_id, hasta(ad_soyad), oda(ad), terapist(personel(ad_soyad)), islem_tanimi_id, islem_tanimi(id, ad), tani, antrenor_id, antrenor:personel(ad_soyad), tedavi_protokolu_id, tedavi_protokolu(id, ad), tamamlanma_aciklamasi, tamamlanma_tarihi, tamamlayan_kullanici:kullanici!randevu_tamamlayan_kullanici_id_fkey(ad_soyad), paket_satis_id, paket_satis(kalan_adet, paket(ad)), hasta_bakiye_hareket(id, tur)";

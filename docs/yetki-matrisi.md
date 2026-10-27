# Yetki Matrisi (otomatik üretildi)

Kaynak: `db/kontrol/yetki-matrisi.sql`, `scripts/dev/kontrol-calistir.mjs`. S=SELECT, I=INSERT, U=UPDATE, D=DELETE. Tabloda görünmeyen rol-tablo çifti = yetki YOK.

## bakim_rolu (1 tablo/görünüm)

| Tablo | Yetki |
|---|---|
| resmi_tatil | S,I,U |

## kimlik_rolu (4 tablo/görünüm)

| Tablo | Yetki |
|---|---|
| kimlik_dogrulama | S,I,U,D |
| kimlik_hesap | S,I,U,D |
| kimlik_kullanici | S,I,U,D |
| oturum | S,I,U,D |

## klinik_anonim (5 tablo/görünüm)

| Tablo | Yetki |
|---|---|
| anket_yaniti | I |
| hasta | I |
| hasta_hassas | I |
| is_basvurusu | I |
| seans_degerlendirme | I |

## klinik_uygulama (76 tablo/görünüm)

| Tablo | Yetki |
|---|---|
| anket_yaniti | S,I,U |
| audit_log | S,I |
| cihaz | S,I,U |
| destek_talebi | S,I,U |
| fatura | S |
| hasta | S,I,U,D |
| hasta_anamnez | S,I,U |
| hasta_bakiye_hareket | S,I |
| hasta_belge | S,I,U,D |
| hasta_hassas | S,I,U |
| hasta_hedef | S |
| hasta_iletisim_log | S |
| hasta_iliski | S |
| hasta_kullanici | S,I,U |
| hasta_olcum | S |
| hasta_onam | S,I |
| hasta_protokol | S,I |
| hasta_sigorta | S |
| hasta_vucut_haritasi_isareti | S,I,U,D |
| hasta_yorum | I |
| is_basvurusu | S,I,U |
| iskonto_oranlari | S,I,U |
| islem_adimi_sablonu | S,I,U |
| islem_kontrendikasyon | S |
| islem_tanimi | S,U |
| islem_tanimi_adim | S |
| kamusal_odeme | S,I,U,D |
| kasa_dengeleme | S,I,D |
| klinik | S,U |
| klinik_arac | S,I,D |
| klinik_ayarlar | S,I,U |
| klinik_banka_hesaplari | S,I,U,D |
| klinik_cari_odeme | S,D |
| klinik_harcama | S,I,U,D |
| klinik_kredi_karti_hareketleri | S |
| klinik_kredi_karti_odeme | S,I,D |
| klinik_kredi_kartlari | S,I,U,D |
| klinik_muhasebe_entegrasyonu | I,U |
| kullanici | S,I,U,D |
| mesaj_kredi_hareketleri | S |
| mesaj_kredileri | S |
| mesaj_kurallari | S,I,U |
| mesaj_kuyrugu | S,I,U |
| nakit_banka_hareketi | S,I,D |
| oda | S,I,U |
| olcek_tanimi | S |
| paket | S,I,U |
| paket_satis | S |
| periyodik_randevu | S,I,U |
| personel | S,I,U |
| personel_acil_kisi | S,I,U |
| personel_egitim | S,I,D |
| personel_hassas | S |
| personel_hesap_hareket | S |
| personel_izin_talebi | S |
| personel_mesleki_belge | S,I,U |
| personel_puantaj | S,I,U |
| personel_puantaj_donem | S |
| personel_ucret | S,I |
| pozisyonlar | S,I,U |
| randevu | S,I,U |
| randevu_cihaz_rezervasyon | S |
| randevu_iptal_talebi | S,I,U |
| randevu_talebi | S,I,U |
| resmi_tatil | S,I,D |
| resmi_tatil_oneri | S,I,U |
| seans_degerlendirme | S,I,U |
| tedavi_protokolu | S,I,U,D |
| tedavi_protokolu_adimi | S,I,D |
| terapist | S,I,U |
| v_hasta_cari_ozet | S |
| v_hasta_detay_ozet | S |
| v_hasta_ozet | S |
| v_personel_bilgi_durumu | S |
| v_personel_hesap_bakiye | S |
| v_personel_izin_bakiye | S |

## klinik_yedek (100 tablo/görünüm)

| Tablo | Yetki |
|---|---|
| anket_yaniti | S |
| audit_log | S |
| cihaz | S |
| destek_talebi | S |
| egzersiz_kutuphanesi | S |
| ev_egzersiz_kalemi | S |
| ev_egzersiz_programi | S |
| ev_egzersiz_takip | S |
| fatura | S |
| hasta | S |
| hasta_anamnez | S |
| hasta_anket | S |
| hasta_bakiye_hareket | S |
| hasta_belge | S |
| hasta_hassas | S |
| hasta_hedef | S |
| hasta_iletisim_log | S |
| hasta_iliski | S |
| hasta_kullanici | S |
| hasta_olcum | S |
| hasta_onam | S |
| hasta_protokol | S |
| hasta_sigorta | S |
| hasta_vucut_haritasi_isareti | S |
| hasta_yorum | S |
| hiz_siniri_sayac | S |
| is_basvurusu | S |
| iskonto_oranlari | S |
| islem_adimi_sablonu | S |
| islem_kategori | S |
| islem_kontrendikasyon | S |
| islem_tanimi | S |
| islem_tanimi_adim | S |
| islem_tanimi_fiyat_gecmisi | S |
| kamusal_odeme | S |
| kasa_dengeleme | S |
| kimlik_dogrulama | S |
| kimlik_hesap | S |
| kimlik_kullanici | S |
| klinik | S |
| klinik_arac | S |
| klinik_ayarlar | S |
| klinik_banka_hesaplari | S |
| klinik_cari_odeme | S |
| klinik_harcama | S |
| klinik_kredi_karti_hareketleri | S |
| klinik_kredi_karti_odeme | S |
| klinik_kredi_kartlari | S |
| klinik_muhasebe_entegrasyonu | S |
| kullanici | S |
| mesaj_kredi_hareketleri | S |
| mesaj_kredileri | S |
| mesaj_kurallari | S |
| mesaj_kuyrugu | S |
| mv_hasta_ilerleme | S |
| nakit_banka_hareketi | S |
| oda | S |
| odeme | S |
| odeme_kalemi | S |
| odeme_satiri | S |
| olcek_tanimi | S |
| oturum | S |
| paket | S |
| paket_satis | S |
| periyodik_randevu | S |
| personel | S |
| personel_acil_kisi | S |
| personel_egitim | S |
| personel_hassas | S |
| personel_hesap_hareket | S |
| personel_izin_talebi | S |
| personel_mesleki_belge | S |
| personel_puantaj | S |
| personel_puantaj_donem | S |
| personel_ucret | S |
| personel_vardiya_atama | S |
| pozisyon_sablonlari | S |
| pozisyonlar | S |
| randevu | S |
| randevu_checklist | S |
| randevu_cihaz_rezervasyon | S |
| randevu_iptal_talebi | S |
| randevu_on_form | S |
| randevu_talebi | S |
| resmi_tatil | S |
| resmi_tatil_oneri | S |
| seans_checklist_sablonu | S |
| seans_degerlendirme | S |
| tedavi_protokolu | S |
| tedavi_protokolu_adimi | S |
| terapist | S |
| v_hasta_cari_ozet | S |
| v_hasta_detay_ozet | S |
| v_hasta_ilerleme | S |
| v_hasta_karsilastirma | S |
| v_hasta_ozet | S |
| v_personel_bilgi_durumu | S |
| v_personel_hesap_bakiye | S |
| v_personel_izin_bakiye | S |
| vardiya_turu | S |

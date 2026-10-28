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

## klinik_uygulama (80 tablo/görünüm)

| Tablo | Yetki |
|---|---|
| anket_yaniti | S,I,U |
| audit_log | S,I |
| cihaz | S,I,U |
| destek_talebi | S,I,U |
| fatura | S |
| hasta | S,I,U |
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
| islem_anahtari | S,I,D |
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
| kullanici | S,I,U |
| mesaj_kredi_hareketleri | S |
| mesaj_kredileri | S |
| mesaj_kurallari | S,I,U |
| mesaj_kuyrugu | S,I,U |
| nakit_banka_hareketi | S,I,D |
| oda | S,I,U |
| odeme | S |
| odeme_kalemi | S |
| odeme_satiri | S |
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
| tedavi_protokolu | S,I,U |
| tedavi_protokolu_adimi | S,I,D |
| terapist | S,I,U |
| v_hasta_cari_ozet | S |
| v_hasta_detay_ozet | S |
| v_hasta_ozet | S |
| v_personel_bilgi_durumu | S |
| v_personel_hesap_bakiye | S |
| v_personel_izin_bakiye | S |

## klinik_yedek (103 tablo/görünüm)

| Tablo | Yetki |
|---|---|
| anket_yaniti | S |
| audit_log | S |
| cihaz | S |
| destek_baglami | S |
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
| islem_anahtari | S |
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
| kullanici_tenant | S |
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

## Kodda doğrudan yetkisi olmayan tablolar (15) ve onlara yazan yollar

`klinik_uygulama`nın bu tablolarda hiçbir tablo/kolon yetkisi yok: kodda doğrudan sorgulanmıyorlar. Yazma yalnız aşağıdaki SECURITY DEFINER fonksiyonlar/tetikleyicilerle olur (gövde taraması: `db/kontrol/yetkisiz-tablo-yazanlar.mjs`). `odeme` ve `odeme_kalemi` politika bağımlılığı nedeniyle (`islem_tanimi_select_portal`) yalnız SELECT yetkisi alır; yazma yolları RPC'dir. İlk sürümde bu bağımlılık gözden kaçmış, gerçek yazma testi `permission denied for table odeme` ile yakalamıştır.

| Tablo | Yazan fonksiyon/RPC | Tabloya bağlı tetikleyiciler |
|---|---|---|
| destek_baglami | `destek_baglami_ac(uuid,text,integer)` (RPC, DEFINER)<br>`destek_baglami_kapat()` (RPC, DEFINER) | — |
| egzersiz_kutuphanesi | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_egzersiz_kutuphanesi_updated_at` |
| ev_egzersiz_kalemi | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_ev_egzersiz_kalemi_updated_at` |
| ev_egzersiz_programi | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_ev_egzersiz_programi_klinik_id`, `trg_ev_egzersiz_programi_updated_at` |
| ev_egzersiz_takip | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_ev_egzersiz_takip_audit`, `trg_ev_egzersiz_takip_klinik_id`, `trg_ev_egzersiz_takip_updated_at` |
| hasta_anket | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_hasta_anket_klinik_id`, `trg_hasta_anket_updated_at` |
| hiz_siniri_sayac | `hiz_siniri_kullan(text,integer,integer,boolean)` (RPC, DEFINER) | — |
| islem_kategori | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_islem_kategori_updated_at` |
| islem_tanimi_fiyat_gecmisi | `islem_tanimi_fiyat_gecmisi_yaz()` (tetikleyici fonksiyonu, DEFINER) | — |
| personel_vardiya_atama | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_personel_vardiya_atama_audit`, `trg_personel_vardiya_atama_klinik_id`, `trg_personel_vardiya_atama_updated_at` |
| pozisyon_sablonlari | — (yazan yok: kullanılmayan/gelecek özellik) | — |
| randevu_checklist | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_randevu_checklist_klinik_id`, `trg_randevu_checklist_updated_at` |
| randevu_on_form | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_1_randevu_on_form_klinik_id`, `trg_2_randevu_on_form_dogrula`, `trg_randevu_on_form_audit` |
| seans_checklist_sablonu | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_seans_checklist_sablonu_updated_at` |
| vardiya_turu | — (yazan yok: kullanılmayan/gelecek özellik) | `trg_vardiya_turu_updated_at` |

**Gerçek yazma testleri** (`scripts/dev/kontrol-calistir.mjs`, `tests/db/anonim-ve-yazma.test.ts`):

| Test | Tablo | Sonuç |
|---|---|---|
| hiz_siniri_kullan (uygulama rolü) | hiz_siniri_sayac | GEÇTİ — 0 → 1 satır |
| hiz_siniri_kullan (anonim rolü, bağlamsız) | hiz_siniri_sayac | GEÇTİ — 0 → 1 satır |
| islem_tanimi fiyat güncelle → fiyat geçmişi tetikleyicisi | islem_tanimi_fiyat_gecmisi | GEÇTİ — 2 → 3 satır |
| klinik oluştur (sağlama, klinik_sahip) → pozisyon_sablonlari okunur, pozisyonlar yazılır | pozisyonlar | GEÇTİ — 0 → 28 satır |
| odeme_olustur → odeme | odeme | GEÇTİ — 0 → 1 satır |
| odeme_olustur → odeme_kalemi | odeme_kalemi | GEÇTİ — 0 → 1 satır |
| odeme_olustur → odeme_satiri | odeme_satiri | GEÇTİ — 0 → 1 satır |

Not: klinik oluşturma uygulama özelliği değildir (kodda klinik INSERT yok); sağlama işlemi `klinik_sahip` + `app.tenant_id` ile yapılır. Yazan fonksiyonu olmayan tablolar (egzersiz, checklist, vardiya, hasta_anket, randevu_on_form, islem_kategori) henüz kullanılmayan özelliklerdir; kullanıma alınırken yetkileri kodla birlikte eklenir (`scripts/dev/kullanim-tara.mjs` otomatik yakalar).

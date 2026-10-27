# SECURITY DEFINER Fonksiyon Sınıflaması

Tarih: 2026-10-27 · Dal: `tasima/windows-postgres`. Otomatik veri: `scripts/dev/definer-envanter.mjs` + `db/kontrol/definer-duman-testi.mjs` (iki klinikli düzenek). Bu belge `scripts/dev/definer-doc-uret.mjs` ile üretilir; açıklama ve gerekçeler o betikteki elle yazılmış tablodadır.

## Özet

- Başlangıç: **83** SECURITY DEFINER fonksiyon (temel şemanın ilk üretimi).
- **3 kaldırıldı/taşındı** (`personel_giris_epostasi`, `portal_giris_epostasi` kaldırıldı; `klinik_qr_bilgisi_getir` `tanima` şemasına taşındı), **1 INVOKER'a çevrildi** (`personel_izin_is_gunu_sayisi`).
- **2 yeni** DEFINER (`tanima.klinik_qr_bilgisi_getir`, `tanima.randevu_klinik_cozumle`; sahibi RLS atlamayan, dar `klinik_tanima` rolü).
- Sonuç: **79 public + 2 tanima = 81 DEFINER** kalır. Hiçbirinin sahibi BYPASSRLS/süper kullanıcı değildir (`db/kontrol/bypassrls-kontrol.sql`).
- Tetikleyici fonksiyonlar: 30; doğrudan çağrılabilen: 49.
- Duman testi (A bağlam yok / B yanlış tenant / C doğru tenant): {"IC":4,"TETIKLEYICI":30,"GECTI":43,"TASARIM_GEREGI":2}. **SIZINTI = 0.**
- 0004 ile bağlamsızken "güvenli açık" davranan iki fonksiyon kapatıldı (`qr_kodu_aktif_mi`, `personel_puantaj_donemi_acik_mi`).

**Test sınırı**: duman testi argümanları ad/tür sezgisiyle bağlar; çoğu RPC'de C durumu iş kuralı hatasıyla düşer (anlamlı iş akışı testi DEĞİL). A/B'de "veri döndürmedi ve satır değiştirmedi" kanıtı yalnız denenen argümanlar için geçerlidir.

## Nedenler (kısaltmalar)

- **baglam**: Özyineleme kırıcı: politikaların çağırdığı rol/kimlik çözümü, kullanici/hasta_kullanici'nin kendi RLS'ine takılmadan çağıranın KENDİ satırını okumalı (sahip_kendi_satir politikası).
- **turet**: Tetikleyici: üst/ilişkili satırı okur (ekleyen rol — terapist, portal hastası, anonim — üst tabloyu göremeyebilir). Yalnız NEW'e değer yazar.
- **denetim**: Tetikleyici: kullanıcının doğrudan yazma yetkisi OLMAYAN türev/denetim tabloya yazar (bilinçli: o tabloda INSERT/UPDATE/DELETE yetkisi/politikası yok).
- **butunluk**: Tetikleyici: RLS'in göremeyeceği çapraz tablo bütünlük kontrolü (çağıranın rolü ilgili tabloyu görmese de kural uygulanmalı).
- **kisit**: Tetikleyici: rol bazlı alan kısıtı; çağıran rolü ve eski/yeni değeri sunucu tarafında doğrular (istemciye güvenilmez).
- **rpc**: Çok tablolu atomik işlem (CLAUDE.md: çok-tablolu işlemler RPC). Tablolara doğrudan yazma yetkisi olmayan roller de kurallı yoldan işlem yapabilsin diye; yetki kontrolü fonksiyon içinde (current_rol/tenant).
- **arsiv**: Toplu arşiv içe aktarma (yalnız klinik_admin); satır bazlı hata toleransı ve çok tablolu yazım tek işlemde.
- **toplam**: Salt-okunur toplam/hesap: kasa/banka/kart bakiyesi için birden çok finans tablosunu okur; çağıran rolünün tablo SELECT yetkisinden bağımsız ve tek sabit kuralla (SQL ve JS kuralı birlikte değişir).
- **anon**: Giriş öncesi (anonim) dar denetim: anon'a tablo SELECT'i yok; fonksiyon yalnız tek bir boolean/çözümleme döndürür. Tenant bağlamı çağıran tarafından (tanima çözümlemesinden sonra) verilmelidir.
- **sistem**: Sistem/bakım işi: DDL veya yalnız belirli rollerin çağırdığı yönetim işlemi.

## Kalan DEFINER fonksiyonlar

| Fonksiyon | Ne yapıyor | Neden DEFINER | Hedef | Tenant bağlamı olmadan ne dönüyor (A durumu) |
|---|---|---|---|---|
| `audit_log_bolum_olustur` | audit_log için eksik aylık bölümleri açar (DDL). | sistem Yalnız bakim_rolu EXECUTE; DDL için sahip yetkisi gerekir. | DEFINER kalacak | çağrılamaz (uygulama/anonim EXECUTE yok) |
| `audit_log_degisiklik_yaz` | Tablo değişikliklerini v2 biçiminde (eski/yeni/değişen alanlar) audit_log'a yazar. | denetim | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `audit_log_yaz` | ~15 tabloda v1 tam satır denetimi yazar. | denetim | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `banka_bakiye_once_toplam_tumu` | Dönem başı banka bakiyesi (tüm hesaplar/hesap bazında), net kart komisyonu dahil. | toplam | DEFINER kalacak | boş / false / NULL |
| `banka_hesabi_butunluk` | havale satırı banka_hesap_id'siz veya başka kliniğin hesabıyla yazılamaz. | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `banka_hesabi_silme_engeli` | Bağlı kaydı olan banka hesabının silinmesini engeller. | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `current_hasta_id` | Portal oturumundaki hastanın id'si (hasta_kullanici, aktif). | baglam | DEFINER kalacak | boş / false / NULL |
| `current_rol` | Çağıranın rolü (kullanici kendi satırı). | baglam | DEFINER kalacak | boş / false / NULL (tasarım gereği) |
| `derive_klinik_id_from_parent` | Alt tablo satırına klinik_id'yi üst satırdan türetir (genel). | turet | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_arsiv_ice_aktar` | Hasta arşiv içe aktarma (dedup'lu). | arsiv | DEFINER kalacak | hata: yetkisiz |
| `hasta_bakiye_hareket_arsiv_ekle` | Ödeme/bakiye geçmişi içe aktarma. | arsiv | DEFINER kalacak | hata: yetkisiz |
| `hasta_bakiye_hareket_borc_duzenle` | Borç satırının iskonto/fatura durumunu düzenler; fatura/ödeme kayıtlarını eşitler. | rpc | DEFINER kalacak | hata: yetkisiz |
| `hasta_bakiye_hareket_kredi_karti_ayari` | Kredi kartı ödemesinde tahsilat hesabı ve komisyon oranı kopyasını yazar. | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_belge_goruntule` | Belge kaydını döndürür ve 'kim hangi belgeyi gördü' kaydını audit_log'a yazar. | denetim | DEFINER kalacak | hata: belge_bulunamadi |
| `hasta_belge_onam_dogrula` | klinik_foto belgesinde onam kaydı zorunlu/uyumlu mu? | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_hassas_denetim_bilgisi_ata` | olusturan/son_guncelleyen alanlarını oturumdan doldurur. | turet | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_hassas_klinik_id_ata` | hasta_hassas.klinik_id'yi hasta'dan türetir (anonim QR kaydında hasta SELECT'i olmadığından DEFINER şart). | turet | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_hassas_terapist_sadece_anamnez_ekle` | Terapist ilk anamnez INSERT'inde yalnız anamnez kolonlarını yazabilir. | kisit | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_hassas_terapist_sadece_anamnez_guncelle` | Terapist UPDATE'inde yalnız anamnez kolonları değişebilir. | kisit | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_iliski_klinik_dogrula` | İlişkili iki hastanın aynı klinikte olduğunu doğrular. | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_portal_alan_kisitla` | Portal hastası hasta satırında yalnız portal formunun alanlarını değiştirebilir. | kisit | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_protokol_kontrendikasyon_kontrol` | Protokol atamasında hastanın risk bayrağı/kontrendikasyonu çakışırsa reddeder. | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_qr_self_servis_mi` | Bu hasta QR self-servis ile mi kaydedildi (hasta_hassas INSERT politikası için)? | anon | DEFINER kalacak | boş / false / NULL |
| `hasta_terapist_sadece_risk_guncelle` | Terapist hasta'da yalnız risk_bayraklari'nı değiştirebilir. | kisit | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hasta_yorum_alanlari_doldur` | Yorumun klinik/hasta alanlarını randevudan türetir. | turet | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `hiz_siniri_kullan` | Postgres sayacıyla hız sınırı (artır/oku), tenant'sız global anahtar. | anon hiz_siniri_sayac'a doğrudan yetki YOK; yalnız bu fonksiyon yazar. | DEFINER kalacak | veri {"hiz_siniri_kullan":true} (tasarım gereği) |
| `is_super_admin` | Çağıran super_admin mi? | baglam | DEFINER kalacak | boş / false / NULL |
| `islem_tanimi_etkin_fiyat` | Hasta kategorisine göre etkin fiyat + iskonto oranı (fiyat tamamen sunucuda). | toplam | DEFINER kalacak | boş / false / NULL |
| `islem_tanimi_fiyat_gecmisi_yaz` | Fiyat değişikliklerini geçmiş tablosuna yazar. | denetim | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `islem_tanimi_kaydet` | Tedavi tanımı + adımlarını atomik diff ile kaydeder. | rpc | DEFINER kalacak | hata: yetkisiz |
| `islem_tanimi_toplam_sure_guncelle` | Üst tanımın süresini adımların toplamı olarak günceller. | denetim | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `kasa_bakiye_once_toplam` | Dönem başı kasa bakiyesi (İstanbul gün sınırı). | toplam | DEFINER kalacak | boş / false / NULL |
| `klinik_cari_odeme_ekle` | Cari ödemesi ekler (advisory lock, bakiyeyi aşamaz). | rpc | DEFINER kalacak | hata: yetkisiz |
| `klinik_harcama_cari_butunluk` | Ödemelerin altına düşüren harcama değişikliğini reddeder. | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `klinik_pozisyonlari_seed` | Yeni klinik için pozisyon şablonlarını kopyalar. | denetim | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `kredi_karti_bakiye_once_toplam` | Dönem başı kredi kartı (POS mutabakat) bakiyesi. | toplam | DEFINER kalacak | boş / false / NULL |
| `mesaj_kredi_senkronla` | Merkezden gelen (bakiye, versiyon) çiftini yerel mesaj_kredileri'ne yazar; eski versiyon ezmez. | sistem Çağıran: sistem_baglami() veya super_admin; (b) sınıfı sayfa çağrısı Aşama 3'te tenant doğrulamalı hâle gelir. | DEFINER kalacak | hata: mismatched parentheses at or near ")" |
| `mesaj_kredi_yukle` | Kredi yükler (yalnız super_admin). | sistem Hiçbir uygulama rolüne EXECUTE verilmedi (iç). | DEFINER kalacak | çağrılamaz (uygulama/anonim EXECUTE yok) |
| `nakit_banka_hareketi_hesap_butunluk` | Nakit/banka hareketinde hesap bütünlüğü. | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `odeme_olustur` | Ödeme + kalem + satır + paket satışı + fatura kuyruğu atomik; paket kota kilidi. | rpc | DEFINER kalacak | hata: yetkisiz |
| `paket_satis_arsiv_ekle` | Paket satış geçmişi içe aktarma. | arsiv | DEFINER kalacak | hata: yetkisiz |
| `personel_hassas_kaydet` | Personel hassas verisini yazar (TC/pasaport), denetim kaydı bırakır. | rpc | DEFINER kalacak | hata: personel_bulunamadi |
| `personel_hassas_maskeli_getir` | Personel hassas verisini maskeli döndürür. | toplam | DEFINER kalacak | hata: personel_bulunamadi |
| `personel_hesap_hareket_donem_ekle` | Dönem kapanışında hakediş hareketini yazar. | rpc | DEFINER kalacak | hata: yetkisiz |
| `personel_hesap_hareket_ekle` | Personel cari defterine hareket ekler. | rpc | DEFINER kalacak | hata: yetkisiz |
| `personel_izin_cakisanlari_getir` | Aynı gün başka personelin izin çakışmasını (yalnız tarih/durum) döndürür. | toplam | DEFINER kalacak | boş / false / NULL |
| `personel_izin_hak_gun_hesapla` | Kıdem+yaştan yıllık izin hakkı gününü hesaplar. | toplam | DEFINER kalacak | boş / false / NULL |
| `personel_izin_talebi_onayla` | Talebi onaylar, puantaja izinli günleri yazar. | rpc | DEFINER kalacak | hata: yetkisiz |
| `personel_izin_talebi_reddet` | Talebi gerekçeyle reddeder. | rpc | DEFINER kalacak | hata: yetkisiz |
| `personel_izin_talebi_yonetici_iptal` | Onaylı, başlamamış izni iptal eder, puantajı temizler. | rpc | DEFINER kalacak | hata: yetkisiz |
| `personel_izin_talep_iptal_et` | Talep sahibi bekleyen talebi iptal eder. | rpc | DEFINER kalacak | hata: talep_bulunamadi |
| `personel_izin_talep_olustur` | İzin talebi oluşturur (çakışma/hak kontrolü). | rpc | DEFINER kalacak | hata: personel_bulunamadi |
| `personel_puantaj_donem_kapat` | Dönemi kapatır, hakedişi deftere yazar (idempotent). | rpc | DEFINER kalacak | hata: yetkisiz |
| `personel_puantaj_donem_yeniden_ac` | Kapalı dönemi yeniden açar, hakediş satırını geri alır. | rpc | DEFINER kalacak | hata: yetkisiz |
| `personel_puantaj_donemi_acik_mi` | Personelin o ayı açık mı? (kilit denetimi) | toplam 0004'te güvenli-kapalı yapıldı: bağlam yok/yanlış tenant → false. | DEFINER kalacak | boş / false / NULL |
| `personel_puantaj_fm_onay_denetim` | Fazla mesai onaylayan/tarihi sunucuda yazar. | kisit | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `personel_puantaj_kendi_kaydet` | Oturumlu personel giriş/çıkışını kendi kimliğiyle kaydeder (saat sunucuda). | rpc | DEFINER kalacak | hata: yetkisiz |
| `personel_puantaj_planlanan_getir` | Planlanan vardiya dakikası. | toplam EXECUTE yok (iç). | DEFINER kalacak | çağrılamaz (uygulama/anonim EXECUTE yok) |
| `personel_puantaj_varsayilanlari_doldur` | Puantaj satırı varsayılanlarını izin/ayardan doldurur. | turet | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `pozisyon_pasif_engelle` | Aktif personeli olan pozisyon pasife alınamaz. | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `qr_kodu_aktif_mi` | Bu klinikte ilgili statik QR açık mı (anahtar yoksa açık)? | anon 0004'te güvenli-kapalı: çağıran tenant bağlamı p_klinik_id ile eşleşmezse false. | DEFINER kalacak | boş / false / NULL |
| `randevu_anket_uygun_mu` | Randevu için anket doldurulabilir mi (tamamlandı, süre içinde)? | anon | DEFINER kalacak | boş / false / NULL |
| `randevu_arsiv_ice_aktar` | Randevu/seans geçmişi içe aktarma. | arsiv | DEFINER kalacak | hata: yetkisiz |
| `randevu_cihaz_rezervasyon_tetikle` | Randevu değişiminde cihaz rezervasyonlarını yeniden üretmeyi tetikler. | denetim | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `randevu_cihaz_rezervasyon_yenile` | Randevunun adım bazlı cihaz rezervasyonlarını yeniden üretir. | denetim EXECUTE yok (iç). | DEFINER kalacak | çağrılamaz (uygulama/anonim EXECUTE yok) |
| `randevu_gelis_isaretle` | Check-in: durum, FIFO paket hakkı düşümü (bakiyeye dokunmaz). | rpc | DEFINER kalacak | hata: randevu_bulunamadi |
| `randevu_gelmedi_isaretle` | Gelmedi: check-in'de düşülen hakkı iade eder. | rpc | DEFINER kalacak | hata: randevu_bulunamadi |
| `randevu_iptal_et` | Bedelli/bedelsiz iptal: hak düşümü/iadesi veya borç. | rpc | DEFINER kalacak | hata: randevu_bulunamadi |
| `randevu_iptal_geri_al` | İptalden çıkış: hak iadesi/borç silme (klinik_admin). | rpc | DEFINER kalacak | hata: randevu_bulunamadi |
| `randevu_iptal_talebi_gec_iptal_ata` | Talepte geç iptal bilgisini sunucuda hesaplar. | turet | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `randevu_iptal_talebi_klinik_id_ata` | Talebe klinik_id'yi randevudan türetir. | turet | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `randevu_on_form_dogrula` | Randevu ön formunun randevuyla uyumunu doğrular. | butunluk | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `randevu_seans_bedelini_isle` | Tamamlanmış paketsiz randevunun bedelini borç yazar, isteğe bağlı ödeme ekler. | rpc | DEFINER kalacak | hata: randevu_bulunamadi |
| `randevu_talebi_klinik_id_ata` | Randevu talebine klinik_id'yi hastadan türetir. | turet | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `resepsiyon_puantaj_gorebilir_mi` | Ayara göre resepsiyon puantajı görebilir mi (politika yardımcısı). | baglam | DEFINER kalacak | boş / false / NULL |
| `resmi_tatil_onerisi_karar` | Bayram önerisini onaylar/reddeder; resmi_tatil'e yazar. | rpc | DEFINER kalacak | hata: yetkisiz |
| `seans_degerlendirme_alanlari_doldur` | Değerlendirmenin klinik/hasta alanlarını randevudan türetir. | turet | DEFINER kalacak | çağrılamaz (tetikleyici); bağlamsız yazım sahip politikası/FK ile düşer |
| `seans_degerlendirme_baglam_getir` | Anket sayfası için klinik adı + zaten dolduruldu mu. | anon | DEFINER kalacak | boş / false / NULL |
| `terapist_id_giris_yapan_kullaniciya_ait_mi` | Terapist kaydı bu oturumdaki kullanıcıya mı ait (politika yardımcısı)? | baglam | DEFINER kalacak | boş / false / NULL |
| `tanima.klinik_qr_bilgisi_getir` | Kısa koddan klinik (id, ad) — tenant bağlamı OLMADAN. | anon Eski public.klinik_qr_bilgisi_getir'in yerine; FORCE RLS altında sahip tenant'sız satır göremediği için dar rol. | YENİ (tanima şeması, sahibi klinik_tanima) | tenant'sız çağrılmak için tasarlandı; klinik_tanima yalnız klinik(id, ad, qr_kisa_kod) ve randevu(id, klinik_id) okur (anonim kayıt testinde doğrulandı) |
| `tanima.randevu_klinik_cozumle` | Randevu id'sinden klinik id'si (anket bağlantısı). | anon Uygulama dönen id'yi app.tenant_id yapıp anket işlemlerini tenant içinde yürütür. | YENİ (tanima şeması, sahibi klinik_tanima) | tenant'sız çağrılmak için tasarlandı; klinik_tanima yalnız klinik(id, ad, qr_kisa_kod) ve randevu(id, klinik_id) okur (anonim kayıt testinde doğrulandı) |

## Kaldırılan / taşınan / çevrilen

| Fonksiyon | Ne yapıyordu | Karar |
|---|---|---|
| `personel_giris_epostasi` | Telefon → personel e-postası (anon çağırabiliyordu). | KALDIRILDI. Supabase auth.users'a bağlıydı ve FORCE RLS altında tenant'sız çalışmaz (boş döner); anonim telefon→e-posta eşlemesi enumeration yüzeyiydi. Yerine Better Auth girişi (kimlik_rolu) — docs/giris-akislari.md. |
| `portal_giris_epostasi` | Telefon → sentetik portal e-postası (anon). | KALDIRILDI (aynı gerekçe). |
| `klinik_qr_bilgisi_getir` | Kısa kod → klinik. | tanima.klinik_qr_bilgisi_getir'e TAŞINDI (public sürüm FORCE RLS altında boş dönerdi). |
| `personel_izin_is_gunu_sayisi` | Tarih aralığında iş günü sayısı (klinik çalışma günleri + resmi tatil). | INVOKER'a ÇEVRİLDİ: yalnız çağıranın kendi kliniğinin satırını ve herkese açık resmi tatili okur; çağıranın yetkisi yeterli, sonuç DEFINER ile aynı. Duman testinde DEFINER hâlinin bağlamsız çağrıda sayı döndürdüğü görülmüştü. |

## Neden hepsi INVOKER yapılamadı

INVOKER'a çevirmek, fonksiyonun çağıranın tablo yetkisi ve RLS görünürlüğüyle aynı sonucu vermesini gerektirir. Kalan DEFINER'ların her biri şu üç gerekçeden en az birine dayanıyor: (1) çağıran rolün ilgili tabloyu göremediği (terapist/resepsiyon/portal hastası/anonim) ama kuralın yine de uygulanması gerektiği durumlar; (2) kullanıcıya doğrudan yazma yetkisi verilmeyen türev/denetim tabloları; (3) politikaların çağırdığı yardımcılarda özyineleme. Bu nedenle toplu çevirme yapılmadı; yalnız davranışı kanıtlanabilen biri çevrildi. Her DEFINER için şu garantiler uygulanır: `SET search_path` sabit (tümünde), sahip RLS'e tabi (FORCE + `sahip_aktif_tenant`), `PUBLIC` EXECUTE yok, tenant bağlamı olmadan veri döndürmeyen/değiştirmeyen (duman testi).

## Açık işler (Aşama 3)

- (b)/(c) sınıfındaki service-role kullanımları kapanırken bu tablodaki "iç" fonksiyonların çağrı yolu da netleşir (ör. `mesaj_kredi_yukle`).
- C durumunun anlamlı iş akışı testleri (geçerli argümanla ödeme/randevu/izin akışları) modül taşımasında yazılacak.
- Giriş öncesi tenant'sız akışlar: `tanima` çözümlemesi → `app.tenant_id` → işlem. Uygulama kodunda bu sıra Aşama 3'te uygulanacak.

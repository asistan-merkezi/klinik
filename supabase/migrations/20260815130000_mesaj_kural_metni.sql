-- Mesaj Kuralları'na (Ayarlar > SMS/Whatsapp/Mail Ayarları) asıl gönderilecek
-- METİN eklendi — önceki migration (20260815110000) sadece hangi kanaldan
-- gidileceğini (checkbox matrisi) tutuyordu, gerçek mesaj içeriği hiç yoktu.
-- Panel kutucuk tasarımına geçti (bölüm başına ModuleCard grid'i) — bir
-- kutucuğa tıklanınca açılan dialogda bu metin düzenlenebiliyor. İdempotent,
-- tek blok.

ALTER TABLE mesaj_kural ADD COLUMN IF NOT EXISTS mesaj_metni text NOT NULL DEFAULT '';

-- mesaj_kural_varsayilan_listesi() dönüş tipine kolon eklendiği için
-- CREATE OR REPLACE yetmiyor (Postgres tablo-dönüşlü fonksiyonlarda mevcut
-- imzayı genişletmeye izin vermiyor) — DROP + CREATE gerekiyor.
DROP FUNCTION IF EXISTS mesaj_kural_varsayilan_listesi();

CREATE FUNCTION mesaj_kural_varsayilan_listesi()
RETURNS TABLE (bolum mesaj_bolum_tipi, tetikleyici_kod text, tetikleyici_adi text, mesaj_metni text)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    ('hasta'::mesaj_bolum_tipi, 'hasta_kayit_hosgeldin', 'Kayıt olunca hoş geldiniz mesajı', 'Merhaba, kliniğimize hoş geldiniz! Kaydınız başarıyla oluşturuldu.'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_paket_satis_ozet', 'Paket satın alınca paket özeti', 'Paketiniz tanımlandı. Seans hakkınızı ve detaylarını hasta portalından takip edebilirsiniz.'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_paket_seans_azaldi', 'Paket seans hakkı azaldığında uyarı', 'Paketinizde kalan seans hakkınız azaldı. Yenilemek isterseniz bizimle iletişime geçebilirsiniz.'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_paket_sure_bitiyor', 'Paket süresi dolmadan hatırlatma', 'Paketinizin süresi yakında sona eriyor. Yenilemek isterseniz size yardımcı olmaktan memnuniyet duyarız.'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_ilk_seans_anket', 'İlk seans sonrası memnuniyet anketi', 'İlk seansınız nasıl geçti? Görüşlerinizi bizimle paylaşır mısınız?'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_seans_sonrasi_anket', 'Her seans sonrası kısa anket', 'Bugünkü seansınızla ilgili kısa bir değerlendirme yapmak ister misiniz?'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_program_tamamlandi', 'Tedavi programı tamamlandığında kapanış anketi', 'Tedavi programınız tamamlandı. Sürecimizi nasıl değerlendirirsiniz?'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_dogum_gunu', 'Doğum günü kutlaması', 'Doğum gününüz kutlu olsun! Size sağlıklı ve mutlu bir yıl dileriz.'),
    ('hasta'::mesaj_bolum_tipi, 'hasta_ozledik', 'Uzun süredir gelmeyen hastaya hatırlatma', 'Sizi bir süredir aramızda göremedik, sizi özledik! Yeni bir randevu almak ister misiniz?'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_onay', 'Randevu oluşturulunca onay mesajı', 'Randevunuz oluşturuldu. Sizi kliniğimizde ağırlamaktan memnuniyet duyarız.'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_hatirlatma_1gun', 'Randevudan 1 gün önce hatırlatma', 'Yarınki randevunuzu hatırlatmak isteriz.'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_hatirlatma_2saat', 'Randevudan 2 saat önce hatırlatma', 'Randevunuza 2 saat kaldı, sizi bekliyoruz.'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_iptal', 'Randevu iptal/erteleme bildirimi', 'Randevunuz iptal edildi/ertelendi. Yeni bir randevu için bizimle iletişime geçebilirsiniz.'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_gelmedi', 'Randevuya gelmedi (no-show) sonrası mesaj', 'Bugünkü randevunuza gelemediğinizi fark ettik. Yeni bir randevu planlamak ister misiniz?'),
    ('randevu'::mesaj_bolum_tipi, 'randevu_sonraki_oneri', 'Randevu sonrası sıradaki randevu önerisi', 'Bir sonraki randevunuzu şimdiden planlamak ister misiniz?'),
    ('personel'::mesaj_bolum_tipi, 'personel_hosgeldin', 'İşe başlama hoş geldiniz mesajı', 'Ekibimize hoş geldiniz! Size başarılar dileriz.'),
    ('personel'::mesaj_bolum_tipi, 'personel_gunluk_program', 'Günlük vardiya/randevu programı bildirimi', 'Bugünkü randevu/vardiya programınız hazır.'),
    ('personel'::mesaj_bolum_tipi, 'personel_bordro_hazir', 'Maaş bordrosu hazır bildirimi', 'Bu ayki bordronuz hazırlandı.'),
    ('personel'::mesaj_bolum_tipi, 'personel_performans_ozet', 'Aylık performans/prim özeti', 'Bu ayki performans ve prim özetiniz hazır.'),
    ('personel'::mesaj_bolum_tipi, 'personel_izin_sonuc', 'İzin talebi onay/red bildirimi', 'İzin talebinizle ilgili sonuç belirlendi.'),
    ('personel'::mesaj_bolum_tipi, 'personel_egitim_hatirlatma', 'Eğitim/toplantı hatırlatması', 'Yaklaşan eğitim/toplantınızı hatırlatmak isteriz.'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_fatura_kesildi', 'Fatura kesildi bildirimi', 'Faturanız kesildi. E-Arşiv PDF dosyanızı iletiyoruz.'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_odeme_yaklasiyor', 'Ödeme vadesi yaklaşıyor hatırlatması', 'Ödeme vadeniz yaklaşıyor.'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_odeme_gecikti', 'Ödeme gecikmesi uyarısı', 'Ödemenizde bir gecikme tespit ettik, en kısa sürede tamamlamanızı rica ederiz.'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_odeme_alindi', 'Ödeme alındı teşekkür mesajı', 'Ödemeniz alındı, teşekkür ederiz.'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_taksit_hatirlatma', 'Sıradaki taksit hatırlatması', 'Sıradaki taksit ödemenizi hatırlatmak isteriz.'),
    ('muhasebe'::mesaj_bolum_tipi, 'muhasebe_donem_ekstre', 'Dönem sonu mutabakat/ekstre bildirimi', 'Dönem sonu hesap ekstreniz hazır.')
$$;

-- Trigger fonksiyonu yeni mesaj_metni kolonunu da INSERT ediyor.
CREATE OR REPLACE FUNCTION mesaj_kural_klinik_seed()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO mesaj_kural (klinik_id, bolum, tetikleyici_kod, tetikleyici_adi, mesaj_metni)
  SELECT NEW.id, v.bolum, v.tetikleyici_kod, v.tetikleyici_adi, v.mesaj_metni
  FROM mesaj_kural_varsayilan_listesi() v
  ON CONFLICT (klinik_id, tetikleyici_kod) DO NOTHING;

  INSERT INTO mesaj_kredi_bakiye (klinik_id, kanal)
  SELECT NEW.id, k FROM unnest(enum_range(NULL::mesaj_kanal_tipi)) AS k
  ON CONFLICT (klinik_id, kanal) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Mevcut klinikler için tek seferlik backfill — kolon ALTER TABLE ile ''
-- varsayılanıyla eklendiği için şu an TÜM satırlar boş; sadece hâlâ boş
-- olanlara yazılıyor ki bu migration tekrar çalışsa (veya admin ileride elle
-- özelleştirip boşaltsa) mevcut özelleştirmenin üstüne yazmasın.
UPDATE mesaj_kural mk
SET mesaj_metni = v.mesaj_metni
FROM mesaj_kural_varsayilan_listesi() v
WHERE mk.tetikleyici_kod = v.tetikleyici_kod AND mk.mesaj_metni = '';

-- Kontrol:
-- SELECT tetikleyici_kod, mesaj_metni FROM mesaj_kural ORDER BY bolum, tetikleyici_kod LIMIT 5;
-- SELECT count(*) FROM mesaj_kural WHERE mesaj_metni = '';

-- Müşteri Takibi seed verisi: VAS/QuickDASH/Oswestry/Berg/SF-36 ölçek tanımları
-- (platform geneli, klinik_id NULL), temel egzersiz kütüphanesi (platform geneli)
-- ve her mevcut klinik için varsayılan seans checklist şablonu. İdempotent.
--
-- ÖNEMLİ: QuickDASH/Oswestry/Berg/SF-36 telifli, standardize klinik ölçüm
-- araçlarıdır. Gerçek soru metinleri burada UYDURULMADI — yanlış/eksik madde
-- klinik karar hatasına yol açabilir. Sadece skorlama iskeleti (kod, min/max,
-- yorum_yonu, madde sayısı placeholder) dolduruldu; soru_semasi.not alanında
-- "resmi kaynaktan doğrulanmalı" uyarısı var. VAS tek soruluk basit bir skala
-- olduğu için tam dolduruldu. egzersiz_kutuphanesi.video_url/gorsel_url NULL
-- bırakıldı (var olmayan URL uydurulmadı) — klinik kendi medyasını ekleyecek.

-- 1) Ölçek tanımları (platform geneli, klinik_id NULL)
INSERT INTO olcek_tanimi (kod, ad, soru_semasi, skorlama_kurali, min_skor, max_skor, yorum_yonu)
VALUES (
  'VAS', 'Görsel Ağrı Skalası (VAS)',
  '[{"id": "vas_agri", "soru": "Şu anki ağrınızı 0 (ağrı yok) ile 10 (dayanılmaz ağrı) arasında değerlendirin.", "min": 0, "max": 10}]'::jsonb,
  '{"tip": "tekil_deger", "soru_id": "vas_agri"}'::jsonb,
  0, 10, 'dusuk_iyi'
)
ON CONFLICT (kod) WHERE klinik_id IS NULL DO NOTHING;

INSERT INTO olcek_tanimi (kod, ad, soru_semasi, skorlama_kurali, min_skor, max_skor, yorum_yonu)
VALUES (
  'QUICKDASH', 'QuickDASH (Kol-Omuz-El Sorunları Kısa Formu)',
  '{"madde_sayisi": 11, "not": "Resmi 11 maddelik QuickDASH soru metni telif korumalıdır; buraya uydurma soru girilmedi. Resmi kaynaktan doğrulanıp klinik_admin tarafından girilmelidir."}'::jsonb,
  '{"tip": "resmi_formul", "not": "((madde_ortalamasi - 1) / 4) * 100 — resmi skorlama kılavuzundan doğrulanmalı"}'::jsonb,
  0, 100, 'dusuk_iyi'
)
ON CONFLICT (kod) WHERE klinik_id IS NULL DO NOTHING;

INSERT INTO olcek_tanimi (kod, ad, soru_semasi, skorlama_kurali, min_skor, max_skor, yorum_yonu)
VALUES (
  'OSWESTRY', 'Oswestry Özürlülük İndeksi',
  '{"madde_sayisi": 10, "not": "Resmi 10 bölümlük Oswestry soru metni telif korumalıdır; buraya uydurma soru girilmedi. Resmi kaynaktan doğrulanıp klinik_admin tarafından girilmelidir."}'::jsonb,
  '{"tip": "resmi_formul", "not": "(toplam_puan / (soru_sayisi * 5)) * 100 — resmi skorlama kılavuzundan doğrulanmalı"}'::jsonb,
  0, 100, 'dusuk_iyi'
)
ON CONFLICT (kod) WHERE klinik_id IS NULL DO NOTHING;

INSERT INTO olcek_tanimi (kod, ad, soru_semasi, skorlama_kurali, min_skor, max_skor, yorum_yonu)
VALUES (
  'BERG', 'Berg Denge Ölçeği',
  '{"madde_sayisi": 14, "not": "Resmi 14 maddelik Berg Denge Ölçeği soru metni telif korumalıdır; buraya uydurma soru girilmedi. Resmi kaynaktan doğrulanıp klinik_admin tarafından girilmelidir."}'::jsonb,
  '{"tip": "toplam", "madde_min": 0, "madde_max": 4}'::jsonb,
  0, 56, 'yuksek_iyi'
)
ON CONFLICT (kod) WHERE klinik_id IS NULL DO NOTHING;

INSERT INTO olcek_tanimi (kod, ad, soru_semasi, skorlama_kurali, min_skor, max_skor, yorum_yonu)
VALUES (
  'SF36', 'SF-36 Yaşam Kalitesi Ölçeği',
  '{"madde_sayisi": 36, "not": "Resmi 36 maddelik SF-36 soru metni telif korumalıdır; buraya uydurma soru girilmedi. Resmi kaynaktan doğrulanıp klinik_admin tarafından girilmelidir."}'::jsonb,
  '{"tip": "alt_olcek", "not": "8 alt ölçek; resmi skorlama kılavuzundan doğrulanmalı"}'::jsonb,
  0, 100, 'yuksek_iyi'
)
ON CONFLICT (kod) WHERE klinik_id IS NULL DO NOTHING;

-- 2) Temel egzersiz kütüphanesi (platform geneli, klinik_id NULL)
INSERT INTO egzersiz_kutuphanesi (ad, aciklama, bolge, varsayilan_set, varsayilan_tekrar, varsayilan_sure_sn)
SELECT * FROM (VALUES
  ('Boyun Fleksiyon-Ekstansiyon', 'Başı yavaşça öne ve arkaya eğme.', 'boyun', 3, 10, NULL::integer),
  ('Boyun Yan Eğme', 'Kulağı omuza yaklaştırarak boynu yana eğme.', 'boyun', 3, 10, NULL),
  ('Omuz Sarkaç Egzersizi', 'Gövdeyi öne eğip kolu serbestçe sallandırma.', 'omuz', 3, NULL, 30),
  ('Omuz Eksternal Rotasyon (Bantlı)', 'Direnç bandıyla omuz dış rotasyon hareketi.', 'omuz', 3, 12, NULL),
  ('Skapular Sıkıştırma', 'Kürek kemiklerini birbirine yaklaştırıp tutma.', 'omuz', 3, 10, 5),
  ('Bel Pelvik Tilt', 'Sırtüstü pozisyonda pelvisi öne-arkaya nazikçe hareket ettirme.', 'bel', 3, 10, NULL),
  ('Bel Köprü (Bridge)', 'Sırtüstü pozisyonda kalçayı kaldırıp indirme.', 'bel', 3, 10, 5),
  ('Diz Kuadriseps Set', 'Dizi düz tutarak uyluk kasını sıkma.', 'diz', 3, 10, 5),
  ('Diz Düz Bacak Kaldırma (SLR)', 'Dizi düz tutarak bacağı yukarı kaldırma.', 'diz', 3, 10, NULL),
  ('Ayak Bileği Alfabe Egzersizi', 'Ayak ucuyla havada alfabe harflerini çizme.', 'ayak_bilegi', 1, NULL, 60)
) AS v(ad, aciklama, bolge, varsayilan_set, varsayilan_tekrar, varsayilan_sure_sn)
WHERE NOT EXISTS (
  SELECT 1 FROM egzersiz_kutuphanesi ek WHERE ek.klinik_id IS NULL AND ek.ad = v.ad
);

-- 3) Varsayılan seans checklist şablonu (her mevcut klinik için bir tane)
INSERT INTO seans_checklist_sablonu (klinik_id, ad, maddeler)
SELECT
  k.id,
  'Standart Seans Checklist',
  '[
    {"metin": "Hasta kimliği doğrulandı", "zorunlu": true, "asama": "seans_oncesi"},
    {"metin": "Risk bayrakları / kontrendikasyonlar kontrol edildi", "zorunlu": true, "asama": "seans_oncesi"},
    {"metin": "Gerekli cihaz/ekipman hazır ve çalışır durumda", "zorunlu": true, "asama": "seans_oncesi"},
    {"metin": "Onam formu (gerekiyorsa) alındı", "zorunlu": false, "asama": "seans_oncesi"},
    {"metin": "VAS ağrı skoru kaydedildi", "zorunlu": true, "asama": "seans_sonrasi"},
    {"metin": "Seans notu girildi", "zorunlu": true, "asama": "seans_sonrasi"},
    {"metin": "Sonraki randevu/ev egzersizi hastaya iletildi", "zorunlu": false, "asama": "seans_sonrasi"}
  ]'::jsonb
FROM klinik k
WHERE NOT EXISTS (
  SELECT 1 FROM seans_checklist_sablonu s WHERE s.klinik_id = k.id AND s.ad = 'Standart Seans Checklist'
);

-- Kontrol:
-- SELECT kod, klinik_id FROM olcek_tanimi WHERE klinik_id IS NULL ORDER BY kod;
-- SELECT count(*) FROM egzersiz_kutuphanesi WHERE klinik_id IS NULL;
-- SELECT k.ad AS klinik, s.ad AS sablon FROM seans_checklist_sablonu s JOIN klinik k ON k.id = s.klinik_id;

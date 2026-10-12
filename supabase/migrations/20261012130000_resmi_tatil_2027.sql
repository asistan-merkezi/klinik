-- 2027 resmi tatilleri. resmi_tatil yalnız 2026 için seed'liydi; 1 Ocak 2027'den itibaren
-- izin gün sayısı (personel_izin_is_gunu_sayisi), izin onayında yazılan puantaj günleri ve
-- Puantaj Cetveli tatil günlerini hiç görmeyecekti.
-- Dini bayram tarihleri Diyanet takvimine göre (Ramazan: arefe 8 Mart, bayram 9-11 Mart;
-- Kurban: arefe 15 Mayıs, bayram 16-19 Mayıs). Arefe yarım günleri 2026 seed'inde olduğu gibi yok.
-- 19 Mayıs hem Kurban Bayramı 4. gün hem Gençlik ve Spor Bayramı — (klinik_id, tarih) tekil, tek satır.
-- HER YIL yeni yılın dini bayramları eklenmeli (yönetim ekranı yok).

insert into resmi_tatil (klinik_id, tarih, ad)
select null, v.tarih::date, v.ad
from (values
  ('2027-01-01', 'Yılbaşı'),
  ('2027-03-09', 'Ramazan Bayramı (1. gün)'),
  ('2027-03-10', 'Ramazan Bayramı (2. gün)'),
  ('2027-03-11', 'Ramazan Bayramı (3. gün)'),
  ('2027-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'),
  ('2027-05-01', 'Emek ve Dayanışma Günü'),
  ('2027-05-16', 'Kurban Bayramı (1. gün)'),
  ('2027-05-17', 'Kurban Bayramı (2. gün)'),
  ('2027-05-18', 'Kurban Bayramı (3. gün)'),
  ('2027-05-19', 'Kurban Bayramı (4. gün) / Atatürk''ü Anma, Gençlik ve Spor Bayramı'),
  ('2027-07-15', 'Demokrasi ve Milli Birlik Günü'),
  ('2027-08-30', 'Zafer Bayramı'),
  ('2027-10-29', 'Cumhuriyet Bayramı')
) as v(tarih, ad)
where not exists (
  select 1 from resmi_tatil r where r.klinik_id is null and r.tarih = v.tarih::date
);

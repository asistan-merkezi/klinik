-- =====================================================================
-- Personel: Eğitim bilgileri (mezun olduğu okul, branş, mezuniyet yılı)
-- Yeni alanlar, mevcut is_basvurusu.egitim_* kolonlarıyla karıştırılmamalı
-- (ayrı tablo/kavram — aday verisi vs. mevcut personel kaydı).
-- =====================================================================

alter table personel
  add column if not exists egitim_okul text,
  add column if not exists egitim_brans text,
  add column if not exists egitim_mezuniyet_yili text;

-- Kontrol:
-- select column_name from information_schema.columns where table_name = 'personel' and column_name like 'egitim_%';

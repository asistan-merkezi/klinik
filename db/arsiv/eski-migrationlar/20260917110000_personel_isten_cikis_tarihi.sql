-- =====================================================================
-- Personel: İşten çıkış tarihi (İş Bilgileri'nde İşe Başlama Tarihi'nin
-- yanına eklendi). Nullable — aktif personelde boş kalır.
-- =====================================================================

alter table personel
  add column if not exists isten_cikis_tarihi date;

-- Kontrol:
-- select column_name from information_schema.columns where table_name = 'personel' and column_name = 'isten_cikis_tarihi';

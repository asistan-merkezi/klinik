-- Personel hesabı oluşturma formu için: T.C. Kimlik No (resmi işlemler/benzersiz
-- kimlik) ve Uzmanlık/Diploma/Tescil No (özellikle terapistler için mevzuat
-- gereksinimi). Kurumsal e-posta ve GSM zaten Supabase Auth (auth.users.email)
-- ve kullanici.telefon üzerinden karşılanıyor, yeni kolon gerekmiyor.
ALTER TABLE personel ADD COLUMN IF NOT EXISTS tc_kimlik_no text;
ALTER TABLE personel ADD COLUMN IF NOT EXISTS uzmanlik_tescil_no text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_personel_tc_kimlik_no
  ON personel(klinik_id, tc_kimlik_no) WHERE tc_kimlik_no IS NOT NULL;

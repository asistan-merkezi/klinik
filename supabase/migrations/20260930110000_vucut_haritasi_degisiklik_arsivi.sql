-- 2D vücut haritası işaretlerinde yapılan her değişikliğin (ekleme / şiddet-not
-- güncelleme / silme) tarihi ve kimin yaptığı audit_log'da arşivlenir.
--
-- Önceki durum: tablo eski audit_log_yaz() (v1) ile izleniyordu — tarih ve kullanıcı
-- vardı ama UPDATE'te yalnız YENİ satır yazıldığından "şiddet 7'den 3'e indi"
-- geri kurulamıyordu.
--
-- Yeni durum: v1 tetikleyicisi kaldırılır, yerine audit_log_degisiklik_yaz() (v2)
-- bağlanır: UPDATE'te degisen_alanlar + eski/yeni (yalnız değişenler), DELETE'te
-- silinen işaretin son hali, her şekilde hasta_id bağlamı. Böylece bir işaret
-- silinse veya üzerine yazılsa da geçmişi audit_log'da kalır.
--
-- KVKK: audit_log yalnız klinik_admin tarafından okunur (audit_log_select_admin);
-- Denetim Geçmişi paneli bu tabloda alan DEĞERLERİNİ göstermez (DEGER_GOSTERILEN_TABLOLAR
-- dışında), yalnız kim/ne zaman/hangi kayıt. Değerler arşivde durur.
--
-- Aynı tabloda iki tetikleyici çift satır üretirdi; bu yüzden eskisi düşürülür.
-- Yeni fonksiyon yok, mevcut fonksiyon kullanılır (overload tuzağı yok). İdempotent.

drop trigger if exists trg_hasta_vucut_haritasi_isareti_audit on hasta_vucut_haritasi_isareti;
drop trigger if exists trg_hasta_vucut_haritasi_isareti_denetim on hasta_vucut_haritasi_isareti;
create trigger trg_hasta_vucut_haritasi_isareti_denetim
  after insert or update or delete on hasta_vucut_haritasi_isareti
  for each row execute function audit_log_degisiklik_yaz();

-- Kontrol:
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'hasta_vucut_haritasi_isareti'::regclass AND NOT tgisinternal;
--   → trg_..._denetim var, trg_..._audit yok
-- Bir işaretin severity'sini değiştirince audit_log'da surum=2, degisen_alanlar=["severity"] satırı oluşmalı.

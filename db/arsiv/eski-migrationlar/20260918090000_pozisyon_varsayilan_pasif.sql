-- Kullanıcı kararı: yeni pozisyonlar artık varsayılan olarak PASİF (aktif=false)
-- geliyor — sistemi kuran klinik_admin, işletmede gerçekten kullanılan
-- departman/unvanları Ayarlar > Personel Tanımlama'dan elle aktifleştirir.
-- Bu SADECE ileriye dönük DEFAULT değişikliği — mevcut kliniklerdeki pozisyon
-- satırlarına dokunulmuyor (hâlihazırda aktif olanlar aktif kalır, kullanıcının
-- açık isteği: "bizde aktif olanlar varsa aktif işaretlensin").
alter table pozisyonlar alter column aktif set default false;

-- Platform şablon kataloğu (pozisyon_sablonlari) aynı ilkeyle güncelleniyor:
-- yeni açılan bir klinik artık 9 şablonu sistem erişimi KAPALI alır (aktif
-- zaten yukarıdaki DEFAULT değişikliğiyle kapalı gelecek, trg_klinik_pozisyonlari_seed
-- 'aktif' kolonunu hiç set etmiyor). Bu UPDATE sadece şablon kataloğunu
-- değiştiriyor — mevcut kliniklerin pozisyonlar tablosundaki satırları
-- BU MİGRATION'DAN ETKİLENMEZ (geriye dönük UPDATE yok, kasıtlı).
update pozisyon_sablonlari set sistem_erisimi = false;

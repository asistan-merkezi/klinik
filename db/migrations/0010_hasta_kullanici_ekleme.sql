-- 0010 (elle yazıldı): resepsiyon/yönetici hasta için portal hesabı açarken `hasta_kullanici` satırını KENDİ tenant bağlamıyla ekleyebilsin.
-- Eskiden bu INSERT servis rolüyle (RLS dışı) yapılıyordu (docs/service-role-siniflama.md #6 -> "(b) withTenant: Better Auth kullanıcı oluşturma +
-- hasta_kullanici INSERT tek akışta"). Tablo INSERT yetkisi (GRANT) zaten kod kullanımından türetilmişti; eksik olan RLS INSERT politikasıdır.
-- Dar tutuldu: yalnız klinik_admin/resepsiyon (UPDATE politikasıyla aynı küme) ve hasta ÇAĞIRANIN KLİNİĞİNDE olmalı. Başka kliniğin hastasına
-- hesap açılamaz (ek olarak kullanici_tenant tetikleyicisi de hastanın kliniğini doğrular). Kimlik kaydı (kimlik_kullanici) ayrı havuzda oluşur.
SET search_path = public, extensions;

CREATE POLICY hasta_kullanici_insert_klinik ON hasta_kullanici AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hasta m
      WHERE m.id = hasta_kullanici.hasta_id
        AND m.klinik_id = (SELECT current_klinik_id())
        AND (SELECT current_rol()) = ANY (ARRAY['klinik_admin'::kullanici_rol_tipi, 'resepsiyon'::kullanici_rol_tipi])
    )
  );

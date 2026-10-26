-- Bağlam fonksiyonları: uygulama her işlemde SET LOCAL app.user_id / app.tenant_id verir (lib/db withTenant).
-- Rol ve portal bağlantısı kullanıcının KENDİ satırından okunur (sahip_kendi_satir politikaları, 0003).
CREATE FUNCTION current_rol() RETURNS kullanici_rol_tipi
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT rol FROM kullanici WHERE id = app_kullanici_id() $$;

CREATE FUNCTION is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT coalesce(current_rol() = 'super_admin', false) $$;

CREATE FUNCTION current_hasta_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT hasta_id FROM hasta_kullanici WHERE id = app_kullanici_id() AND aktif = true $$;

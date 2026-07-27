-- Yeni rol: muhasebe/finans personeli (fatura kesme, ciro raporları, borç/alacak
-- takibi; hasta tıbbi/kişisel verisine erişimi yok). Ayrı migration'da: enum
-- değeri eklendiği transaction commit olmadan aynı işlemde kullanılamaz
-- (Postgres kısıtı), bu yüzden RLS güncellemeleri bir sonraki migration'da.
ALTER TYPE kullanici_rol_tipi ADD VALUE IF NOT EXISTS 'muhasebe';

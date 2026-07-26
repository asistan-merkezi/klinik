-- randevu tablosunu Supabase Realtime (postgres_changes) yayınına ekler.
-- Tablet ekranı check-in durumundaki değişiklikleri anlık dinleyebilsin diye gerekli.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'randevu'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE randevu;
  END IF;
END $$;

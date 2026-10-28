-- Eski (v1) audit_log_yaz() tetikleyici fonksiyonu (personel_puantaj, personel_hesap_hareket, personel_izin_talebi,
-- seans_notu, hasta_belge vb. ~15 tablo) klinik silinirken (ON DELETE CASCADE) bozuluyordu: alt satır silinince tetikleyici,
-- artık var olmayan klinik_id ile audit_log satırı eklemeye çalışıp FK ihlaliyle (audit_log_klinik_id_fkey*) TÜM klinik
-- silmeyi iptal ediyordu. Yeni (v2) audit_log_degisiklik_yaz() bu kontrolü zaten yapıyor (20260930100000);
-- v1'e de aynı korumayı ekliyoruz. Davranış: klinik yoksa denetim satırı YAZILMAZ (silinen klinikle birlikte anlamsız).
--
-- 2026-10-12'de gerçek bir test kliniğiyle yeniden üretildi: tek bir personel_puantaj satırı klinik silmeyi engelledi.
-- Yalnız fonksiyon gövdesini değiştirir (CREATE OR REPLACE, aynı imza) — tetikleyiciler ve satırlar değişmez, idempotent.
--
-- UYGULAMA SIRASI: kod bu migration'a BAĞLI DEĞİL; serbestçe uygulanabilir.

CREATE OR REPLACE FUNCTION audit_log_yaz()
RETURNS trigger AS $$
DECLARE
  v_klinik_id uuid;
  v_hedef_id uuid;
BEGIN
  v_klinik_id := COALESCE(NEW.klinik_id, OLD.klinik_id);
  v_hedef_id := COALESCE(NEW.id, OLD.id);

  -- Klinik silinirken (CASCADE) klinik satırı artık yok: FK'yi ihlal edecek denetim satırı yazma.
  IF v_klinik_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM klinik WHERE id = v_klinik_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
  VALUES (
    v_klinik_id,
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    v_hedef_id,
    to_jsonb(COALESCE(NEW, OLD))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Doğrulama (uygulandıktan sonra, service_role ile): geçici klinik + personel + personel_puantaj satırı kur,
--   delete from klinik where id = '<geçici>'  → hatasız silinmeli (önceden audit_log_klinik_id_fkey1 hatası).

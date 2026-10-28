-- Mesajlaşma: kredi modeli merkeze (Asistan Merkezi) taşınıyor — Faz 2'deki
-- yerel atomik kredi düşüm/iade fonksiyonları YANLIŞTI, iptal edildi.
-- mesaj_kredileri artık bir DEFTER değil, merkezin bakiyesinin YEREL
-- YANSIMASIDIR — bakiye sadece merkezden dönen değerle set edilir, hiçbir
-- yerel "bakiye - 1" hesaplaması yapılmaz. İdempotent, tek blok.

-- 1) mesaj_kredileri — senkron takibi için iki yeni kolon.
ALTER TABLE mesaj_kredileri ADD COLUMN IF NOT EXISTS son_senkron_zamani timestamptz;
ALTER TABLE mesaj_kredileri ADD COLUMN IF NOT EXISTS merkez_bakiye_versiyonu bigint NOT NULL DEFAULT 0;

-- 2) mesaj_kredi_hareketleri artık SADECE 'yukleme' (bilgi amaçlı geçmiş) —
-- 'dusum'/'iade' artık merkezin kendi defterinde, yerelde YAZILAMAZ. Önce
-- (varsa) Faz 1/2 test verisinden kalmış dusum/iade satırları temizleniyor
-- (gerçek üretim klinik'inde canlıda kontrol edildi: 1 satır var, o da
-- 'yukleme' — bu DELETE üretimde 0 satır siliyor, ama migration'ın kendisi
-- her ortamda güvenle tekrar çalışabilsin diye idempotent/defensive yazıldı).
DELETE FROM mesaj_kredi_hareketleri WHERE tip <> 'yukleme';

ALTER TABLE mesaj_kredi_hareketleri DROP CONSTRAINT IF EXISTS mesaj_kredi_hareketleri_sadece_yukleme;
ALTER TABLE mesaj_kredi_hareketleri ADD CONSTRAINT mesaj_kredi_hareketleri_sadece_yukleme CHECK (tip = 'yukleme');

-- 3) Faz 2'nin yerel atomik kredi fonksiyonları kaldırıldı — kredi düşümü/
-- iadesi artık TAMAMEN merkezin sorumluluğunda, klinik tarafı hiçbir zaman
-- bakiyeyi kendi hesaplamıyor.
DROP FUNCTION IF EXISTS mesaj_kredi_dus(uuid, mesaj_kanal_tipi, uuid);
DROP FUNCTION IF EXISTS mesaj_kredi_iade(uuid, mesaj_kanal_tipi, uuid);

-- 4) mesaj_kredi_senkronla — merkezden dönen (bakiye, versiyon) çiftini
-- yerel tabloya YAZAR, hesaplamaz. Versiyon guard'ı (WHERE ... < EXCLUDED)
-- hem ilk kayıt (satır yoksa INSERT) hem sonraki senkronlar için TEK
-- statement'ta atomik — gecikmiş/sıra dışı gelen bir yanıt daha taze bir
-- versiyonu asla EZEMEZ. SADECE service_role/super_admin çağırabilir
-- (Faz 2'deki auth.role()='service_role' teyidiyle aynı desen — bkz.
-- migration 20260816100000/100001'deki gerçek teşhis).
CREATE OR REPLACE FUNCTION mesaj_kredi_senkronla(
  p_klinik_id uuid,
  p_kanal mesaj_kanal_tipi,
  p_bakiye integer,
  p_versiyon bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT COALESCE(auth.role() = 'service_role' OR is_super_admin(), false) THEN
    RAISE EXCEPTION 'yetkisiz';
  END IF;

  INSERT INTO mesaj_kredileri (klinik_id, kanal, bakiye, son_senkron_zamani, merkez_bakiye_versiyonu)
  VALUES (p_klinik_id, p_kanal, p_bakiye, now(), p_versiyon)
  ON CONFLICT (klinik_id, kanal) DO UPDATE
  SET bakiye = EXCLUDED.bakiye,
      son_senkron_zamani = EXCLUDED.son_senkron_zamani,
      merkez_bakiye_versiyonu = EXCLUDED.merkez_bakiye_versiyonu,
      updated_at = now()
  WHERE mesaj_kredileri.merkez_bakiye_versiyonu < EXCLUDED.merkez_bakiye_versiyonu;
END;
$function$;

REVOKE ALL ON FUNCTION mesaj_kredi_senkronla(uuid, mesaj_kanal_tipi, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mesaj_kredi_senkronla(uuid, mesaj_kanal_tipi, integer, bigint) TO service_role;

-- Not (kontrol edildi, yeni tablo gerekmedi): audit_log zaten klinik projesinde
-- var (migration 20260726083923, cekirdek şema) — klinik_id/kullanici_id
-- (nullable)/eylem text/hedef_tablo text/hedef_id uuid/detay jsonb/created_at
-- şeması genel amaçlı, kredi-senkron cron'unun "yerel/merkez bakiyesi
-- uyuşmuyor" olayını eylem='mesaj_kredi_senkron_farki' + detay jsonb ile
-- yazması için birebir yeterli — service role zaten RLS'i bypass ettiği için
-- ayrı bir INSERT policy de gerekmiyor.

-- Kontrol:
-- SELECT column_name FROM information_schema.columns WHERE table_name='mesaj_kredileri' AND column_name IN ('son_senkron_zamani','merkez_bakiye_versiyonu');
-- SELECT conname FROM pg_constraint WHERE conname='mesaj_kredi_hareketleri_sadece_yukleme';
-- SELECT proname FROM pg_proc WHERE proname IN ('mesaj_kredi_senkronla','mesaj_kredi_dus','mesaj_kredi_iade');

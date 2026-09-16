-- 20260916092000'deki CHECK constraint'leri hatalıydı — canlıda ilk gerçek
-- "Kasaya Giren" test kaydında yakalandı: nakit_banka_hareketi_hedef_kural,
-- tip='gelen' (Giren akışı) için hedefin kasa/banka olmasını YASAKLIYORDU,
-- oysa "Giren"in tüm amacı budur (para dışarıdan kasaya/bankaya giriyor).
-- Doğru model: tip='gelen' → kaynak HARİCİ (ne kasa ne banka), hedef İÇ
-- (kasa XOR banka); tip='giden' → kaynak İÇ, hedef HARİCİ; tip='hesaplar_arasi'
-- → ikisi de İÇ ve birbirinden farklı. Ayrıca farkli_hesap constraint'inde
-- OR olması gereken yerde OR vardı ama iki koşul da AYRI AYRI yeterli
-- sayılıyordu (olması gereken: ikisi BİRDEN sağlanmalı) — aynı banka
-- hesabından kendine transferi yanlışlıkla geçerli sayıyordu, bu turda
-- fark edilip düzeltiliyor. İdempotent, tek blok.

ALTER TABLE nakit_banka_hareketi
  DROP CONSTRAINT IF EXISTS nakit_banka_hareketi_kaynak_xor,
  DROP CONSTRAINT IF EXISTS nakit_banka_hareketi_hedef_kural,
  DROP CONSTRAINT IF EXISTS nakit_banka_hareketi_farkli_hesap;

ALTER TABLE nakit_banka_hareketi
  ADD CONSTRAINT nakit_banka_hareketi_kaynak_kurali CHECK (
    (tip = 'gelen' AND NOT kaynak_kasa AND kaynak_banka_hesap_id IS NULL)
    OR (
      tip IN ('giden', 'hesaplar_arasi')
      AND ((kaynak_kasa AND kaynak_banka_hesap_id IS NULL) OR (NOT kaynak_kasa AND kaynak_banka_hesap_id IS NOT NULL))
    )
  ),
  ADD CONSTRAINT nakit_banka_hareketi_hedef_kurali CHECK (
    (tip = 'giden' AND NOT hedef_kasa AND hedef_banka_hesap_id IS NULL)
    OR (
      tip IN ('gelen', 'hesaplar_arasi')
      AND ((hedef_kasa AND hedef_banka_hesap_id IS NULL) OR (NOT hedef_kasa AND hedef_banka_hesap_id IS NOT NULL))
    )
  ),
  ADD CONSTRAINT nakit_banka_hareketi_farkli_hesap CHECK (
    tip <> 'hesaplar_arasi'
    OR (NOT (kaynak_kasa AND hedef_kasa) AND kaynak_banka_hesap_id IS DISTINCT FROM hedef_banka_hesap_id)
  );

-- Kontrol:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'nakit_banka_hareketi'::regclass AND contype='c';
-- -- Geçerli örnekler (hata vermemeli, sonra silinebilir):
-- -- INSERT INTO nakit_banka_hareketi (klinik_id, tip, kaynak_kasa, hedef_kasa, tutar) SELECT id, 'gelen', false, true, 1 FROM klinik LIMIT 1;
-- -- Geçersiz örnek (hata vermeli — aynı hesaptan kendine transfer):
-- -- INSERT INTO nakit_banka_hareketi (klinik_id, tip, kaynak_banka_hesap_id, hedef_banka_hesap_id, tutar) SELECT k.id, 'hesaplar_arasi', b.id, b.id, 1 FROM klinik k JOIN klinik_banka_hesaplari b ON b.klinik_id = k.id LIMIT 1;

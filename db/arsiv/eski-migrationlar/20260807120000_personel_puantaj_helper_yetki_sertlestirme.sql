-- personel_puantaj_planlanan_getir ve personel_puantaj_donemi_acik_mi:
-- Postgres'te fonksiyonlar varsayılan olarak PUBLIC'e EXECUTE izniyle
-- oluşturulur — PostgREST public şemadaki her fonksiyonu otomatik bir RPC
-- endpoint'i olarak açtığı için, bu ikisi p_personel_id parametresiyle
-- çağrıldığında klinik sahipliği hiç kontrol edilmiyordu: authenticated
-- herhangi bir kullanıcı, BAŞKA bir kliniğin personelinin vardiya saatini
-- (planlanan_getir) veya puantaj döneminin açık/kapalı durumunu
-- (donemi_acik_mi) sorgulayabilirdi (SECURITY DEFINER olduğu için RLS'i
-- bypass ediyorlardı). UI için Çalışma Çizelgesi ekranı yazılırken fark
-- edildi — ikisine de ilgili tablonun klinik_id'sini current_klinik_id()
-- ile (veya süper_admin) karşılaştıran bir filtre eklendi, ayrıca PUBLIC'ten
-- REVOKE edilip sadece authenticated'e GRANT edildi (anon hiç çağıramaz).
CREATE OR REPLACE FUNCTION personel_puantaj_planlanan_getir(p_personel_id uuid, p_tarih date)
RETURNS TABLE(vardiya_turu_id uuid, baslangic time, bitis time) AS $$
  SELECT pva.vardiya_turu_id, vt.baslangic_saat, vt.bitis_saat
  FROM personel_vardiya_atama pva
  JOIN vardiya_turu vt ON vt.id = pva.vardiya_turu_id
  WHERE pva.personel_id = p_personel_id
    AND (pva.klinik_id = current_klinik_id() OR is_super_admin())
    AND pva.haftanin_gunu = EXTRACT(DOW FROM p_tarih)::smallint
    AND pva.gecerlilik_baslangic <= p_tarih
    AND (pva.gecerlilik_bitis IS NULL OR pva.gecerlilik_bitis >= p_tarih)
  ORDER BY pva.gecerlilik_baslangic DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION personel_puantaj_planlanan_getir(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION personel_puantaj_planlanan_getir(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION personel_puantaj_donemi_acik_mi(p_personel_id uuid, p_tarih date)
RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM personel_puantaj_donem d
    WHERE d.personel_id = p_personel_id
      AND (d.klinik_id = current_klinik_id() OR is_super_admin())
      AND d.yil = EXTRACT(YEAR FROM p_tarih)::int
      AND d.ay = EXTRACT(MONTH FROM p_tarih)::int
      AND d.durum = 'kapali'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION personel_puantaj_donemi_acik_mi(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION personel_puantaj_donemi_acik_mi(uuid, date) TO authenticated;

-- Kontrol: başka klinikten bir personel_id ile çağrıldığında artık boş/true
-- (yani "kısıtlı değil" ama hiçbir gerçek veri sızdırmadan) dönmeli; RLS
-- INSERT/UPDATE WITH CHECK içindeki kullanım (authenticated rolüyle) değişmedi.

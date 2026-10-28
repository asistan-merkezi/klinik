-- QR Kodları — Yönetim Listesi: klinik_admin artık her statik QR'ı (Hasta Ön
-- Kayıt/Anket/Personel Puantaj Giriş-Çıkış) aç/kapa yönetebiliyor. Yeni bir
-- tablo GEREKMİYOR — Tablet Görünümü ayarlarıyla (bkz. tabletAyarlariGuncelle)
-- birebir aynı desen: klinik_ayarlar.ayarlar jsonb'sinde yeni bir "qr_kodlari"
-- anahtarı, { [tip]: { aktif: boolean } } şeklinde.
--
-- Anonim public form sayfalarının (auth.uid() NULL) "bu QR aktif mi" sorusunu
-- sorabilmesi gerekiyor, ama klinik_ayarlar'ın RLS SELECT policy'si
-- current_klinik_id() üzerinden authenticated bir oturum gerektiriyor —
-- klinik_qr_bilgisi_getir ile aynı sebep/desen: STABLE SECURITY DEFINER RPC.
--
-- Opt-out varsayılan: anahtar hiç yoksa (migration öncesi hiçbir klinikte
-- qr_kodlari set edilmemiş) TRUE döner — bu migration hiçbir mevcut QR'ı
-- aniden kapatmasın diye.
CREATE OR REPLACE FUNCTION qr_kodu_aktif_mi(p_klinik_id uuid, p_tip text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (ayarlar -> 'qr_kodlari' -> p_tip ->> 'aktif')::boolean
      FROM klinik_ayarlar
      WHERE klinik_id = p_klinik_id
    ),
    true
  );
$$;

GRANT EXECUTE ON FUNCTION qr_kodu_aktif_mi(uuid, text) TO anon, authenticated;

-- Kontrol:
-- SELECT proname FROM pg_proc WHERE proname = 'qr_kodu_aktif_mi';
-- SELECT qr_kodu_aktif_mi('00000000-0000-0000-0000-000000000000', 'anket'); -- true dönmeli (satır yok)

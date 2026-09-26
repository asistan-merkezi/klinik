-- İşlem Tanımlama kataloğuna "Gerekli Cihaz" eklendi — tedavi adımındaki
-- "Gerekli Cihaz" alanının bir eşi, `cihaz` kataloğunu referans alır (aynı
-- desen: uygulayici_pozisyon_id -> pozisyonlar).

ALTER TABLE islem_adimi_sablonu
  ADD COLUMN IF NOT EXISTS gerekli_cihaz_id uuid REFERENCES cihaz(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_islem_adimi_sablonu_gerekli_cihaz_id
  ON islem_adimi_sablonu(gerekli_cihaz_id);

-- Paketler ekranı: arşivdeki (satış süresi dolmuş) bir paket "Tekrarla" ile
-- kopyalanabiliyor; kopya, orijinal bilgi amaçlı olarak "tekrar sayısı 2"
-- rozetiyle işaretleniyor (kullanıcı kararı — artan bir sayaç DEĞİL, sabit
-- bilgi etiketi, tekrar tekrar tekrarlansa bile hep 2 kalır).
ALTER TABLE paket ADD COLUMN tekrar_sayisi integer NOT NULL DEFAULT 1;

-- Kontrol:
-- SELECT column_name, column_default FROM information_schema.columns WHERE table_name = 'paket' AND column_name = 'tekrar_sayisi';

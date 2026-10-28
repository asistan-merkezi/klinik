-- Mesaj kurallarında hiçbir kanal önceden seçili gelmesin: kullanıcı seçsin.
-- Eski şema WhatsApp'ı varsayılan açık bırakıyordu (kolon DEFAULT true) ve
-- v2 taşıması mevcut kliniklerin 27 kuralının hepsini whatsapp_aktif=true
-- olarak taşımıştı — bunlar kullanıcı seçimi değil, seed idi.
ALTER TABLE mesaj_kurallari ALTER COLUMN whatsapp_aktif SET DEFAULT false;

UPDATE mesaj_kurallari SET whatsapp_aktif = false WHERE whatsapp_aktif = true;

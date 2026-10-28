-- İzin talebi belge yükleme (personel_izin_talebi.belge_url) personel-belge
-- bucket'ını kullanıyor — bucket önceden sadece kaşe görseli (jpeg/png/webp)
-- için kısıtlıydı, PDF (örn. doktor raporu/mazeret belgesi) reddediliyordu.
-- Adversarial review sırasında bulundu: form "accept .pdf" gösteriyordu ama
-- upload sessizce başarısız olacaktı.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'personel-belge';

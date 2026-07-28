-- Kan sulandırıcı kullanımı da artık diğer anamnez parametreleri gibi
-- üçlü durumlu (NULL = henüz sorulmadı, true/false = hastanın yanıtı)
-- Evet/Hayır arayüzüyle tutarlı olsun diye NOT NULL kaldırılır.
ALTER TABLE musteri_hassas ALTER COLUMN kan_sulandirici_kullanimi DROP NOT NULL;

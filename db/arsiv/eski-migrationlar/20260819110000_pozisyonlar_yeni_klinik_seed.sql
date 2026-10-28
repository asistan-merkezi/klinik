-- Bulunan gerçek hata: pozisyonlar için "her klinike 9 şablon" seed'i sadece
-- migration ANINDA var olan kliniklere uygulanmıştı (bkz. 20260819100000,
-- adım 5) — YENİ açılan bir klinik hiç pozisyon almadan geliyordu, Pozisyonlar
-- sekmesi "Henüz pozisyon tanımlı değil" gösteriyordu (Playwright ile gerçek
-- bir test kliniği oluşturulup doğrulandı). Bu, CLAUDE.md'nin "yeni klinik
-- onboarding akışı: varsayılan... şablonları otomatik yüklenir" hedefinin
-- pozisyonlar için henüz hiç kurulmamış olduğunu gösterdi (klinik tablosunda
-- bu iş için önceden hiçbir trigger yoktu, information_schema ile doğrulandı).
create or replace function klinik_pozisyonlari_seed()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into pozisyonlar (klinik_id, sablon_id, ad, grup, sira, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu)
  select new.id, s.id, s.ad, s.grup, s.sira, s.sistem_erisimi, s.varsayilan_rol, s.ucret_tipi, s.puantaj_modu
  from pozisyon_sablonlari s;
  return new;
end;
$$;

create trigger trg_klinik_pozisyonlari_seed
  after insert on klinik
  for each row execute function klinik_pozisyonlari_seed();

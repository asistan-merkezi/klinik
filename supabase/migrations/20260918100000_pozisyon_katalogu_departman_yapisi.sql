-- Kullanıcı kararı: pozisyon kataloğu (eski 9 şablon) departman bazlı, 28
-- kalemlik yeni bir yapıyla tamamen değiştirildi. Hem platform şablonu
-- (pozisyon_sablonlari — yeni açılacak klinikler için) hem de tek mevcut
-- kliniğin (Fzt. Ahmet Enes Yenipazar) kendi pozisyonlar satırları bu
-- migration'la yenileniyor. Yeni satırlar varsayılan pasif geliyor
-- (20260918090000'daki karar) — sadece hâlihazırda personel bağlı olan 5
-- pozisyon aktif bırakıldı, kullanıcının "bizde aktif olanlar varsa aktif
-- işaretlensin" isteğiyle tutarlı.
begin;

-- 1) Personelin ŞU ANKİ pozisyonunun adını sakla — aşağıda eski satırlar
--    silinmeden önce, yeniden bağlama için gerekiyor.
create temp table _personel_eski_pozisyon as
select p.id as personel_id, poz.ad as eski_ad
from personel p
join pozisyonlar poz on poz.id = p.pozisyon_id
where p.klinik_id = '7d259889-5bd8-4702-9e39-d86488234667';

-- 2) Eski klinik pozisyonlarını ve platform şablonlarını temizle.
delete from pozisyonlar where klinik_id = '7d259889-5bd8-4702-9e39-d86488234667';
delete from pozisyon_sablonlari;

-- 3) Yeni platform şablon kataloğu — 6 departman, 28 unvan.
insert into pozisyon_sablonlari (ad, grup, sira, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu) values
  ('İşletme Ortağı',                        'Yönetim & İdari Departmanı',              110, false, 'klinik_admin', 'aylik_maas', 'esnek'),
  ('Klinik Yöneticisi',                     'Yönetim & İdari Departmanı',              120, false, 'klinik_admin', 'aylik_maas', 'esnek'),
  ('Muhasebe / Finans Sorumlusu',           'Finans & Muhasebe Departmanı',            210, false, 'muhasebe',     'aylik_maas', 'esnek'),
  ('Akademisyen / Profesör (Prof)',         'Klinik & Terapi Departmanı',              310, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Doçent Doktor (Doç. Dr.)',              'Klinik & Terapi Departmanı',              320, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Ortopedi / Spor Hekimi',                'Klinik & Terapi Departmanı',              330, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Uzman Doktor',                          'Klinik & Terapi Departmanı',              340, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Fizyoterapist',                         'Klinik & Terapi Departmanı',              350, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Spor Fizyoterapisti',                   'Klinik & Terapi Departmanı',              360, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Pediatrik Fizyoterapist',               'Klinik & Terapi Departmanı',              370, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Manuel Terapist',                       'Klinik & Terapi Departmanı',              380, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Ergoterapist',                          'Klinik & Terapi Departmanı',              390, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Konuşma ve Yutma Terapisti',            'Klinik & Terapi Departmanı',              400, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Terapist',                              'Klinik & Terapi Departmanı',              410, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Osteopat',                              'Klinik & Terapi Departmanı',              420, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Diyetisyen',                            'Klinik & Terapi Departmanı',              430, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Klinik Psikolog',                       'Klinik & Terapi Departmanı',              440, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Hemşire',                               'Klinik & Terapi Departmanı',              450, false, 'terapist',     'aylik_maas', 'gunluk'),
  ('Masör',                                 'Klinik & Terapi Departmanı',              460, false, 'terapist',     'prim_usulu', 'gunluk'),
  ('Fizyoterapi Asistanı / Teknikeri',      'Klinik & Terapi Departmanı',              470, false, 'terapist',     'aylik_maas', 'gunluk'),
  ('Stajyer Fizyoterapist',                 'Klinik & Terapi Departmanı',              480, false, 'terapist',     'aylik_maas', 'gunluk'),
  ('Hasta Hizmetleri / Danışmanı',          'Pazarlama & Hasta İlişkileri Departmanı', 510, false, 'resepsiyon',   'aylik_maas', 'gunluk'),
  ('Kurumsal İlişkiler / Anlaşma Sorumlusu','Pazarlama & Hasta İlişkileri Departmanı', 520, false, 'resepsiyon',   'aylik_maas', 'esnek'),
  ('Dijital Pazarlama & Sosyal Medya Uzmanı','Pazarlama & Hasta İlişkileri Departmanı',530, false, 'resepsiyon',   'aylik_maas', 'esnek'),
  ('Resepsiyon / Banko Personeli',          'Operasyon & Karşılama Departmanı',        610, false, 'resepsiyon',   'aylik_maas', 'gunluk'),
  ('Teknik Servis / Bakım Onarım',          'Destek Hizmetleri Departmanı',            710, false, 'terapist',     'aylik_maas', 'esnek'),
  ('Şoför / Ulaşım',                        'Destek Hizmetleri Departmanı',            720, false, 'terapist',     'aylik_maas', 'esnek'),
  ('Temizlik Personeli',                    'Destek Hizmetleri Departmanı',            730, false, 'terapist',     'aylik_maas', 'gunluk');

-- 4) Mevcut kliniğe aynı katalogdan pozisyon satırları — sadece hâlihazırda
--    personel bağlı olan 5 tanesi aktif (Spor Fizyoterapisti, Manuel
--    Terapist, Terapist, Fizyoterapist, Akademisyen / Profesör (Prof)).
insert into pozisyonlar (klinik_id, sablon_id, ad, grup, sira, aktif, sistem_erisimi, varsayilan_rol, ucret_tipi, puantaj_modu, ozel_mi)
select
  '7d259889-5bd8-4702-9e39-d86488234667',
  s.id, s.ad, s.grup, s.sira,
  s.ad in ('Spor Fizyoterapisti', 'Manuel Terapist', 'Terapist', 'Fizyoterapist', 'Akademisyen / Profesör (Prof)'),
  false, s.varsayilan_rol, s.ucret_tipi, s.puantaj_modu, false
from pozisyon_sablonlari s;

-- 5) Personeli yeni pozisyonlara yeniden bağla (eski ada göre karşılığı) +
--    gorev metnini pozisyon adıyla eşitle. Eşleme: Spor Fizyoterapisti ve
--    Fizyoterapist birebir aynı ad; Manuel Terapist ve Terapist (eski ad
--    "terapist") gerçek pozisyon_id'ye göre; "prfo" -> Akademisyen / Profesör
--    (Prof) (kullanıcının kısaltması).
update personel p
set pozisyon_id = poz.id,
    gorev = poz.ad
from _personel_eski_pozisyon epp
join pozisyonlar poz
  on poz.klinik_id = '7d259889-5bd8-4702-9e39-d86488234667'
  and poz.ad = case epp.eski_ad
    when 'Spor Fizyoterapisti' then 'Spor Fizyoterapisti'
    when 'Manuel Terapist' then 'Manuel Terapist'
    when 'terapist' then 'Terapist'
    when 'Fizyoterapist' then 'Fizyoterapist'
    when 'prfo' then 'Akademisyen / Profesör (Prof)'
  end
where p.id = epp.personel_id;

drop table _personel_eski_pozisyon;

commit;

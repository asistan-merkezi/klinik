# Şema Eşleme (Supabase → düz Postgres) — Aşama 2

Tarih: 2026-10-26 · Dal: `tasima/windows-postgres`. Üretici: `db/arac/sema-uret.mjs`; çıktılar `db/migrations/0001–0003`, `db/seed/0001_referans_veri.sql`; kurulum `db/kurulum/00–02`; denetim `db/kontrol/bypassrls-kontrol.sql`; orkestrasyon `scripts/db-kur.ps1`.

## Nasıl üretildi
172 migration + `supabase/bekleyen/…puantaj_pin_kaldir.sql`, gerçek Postgres 18.4'te, yalnız `auth`/`storage`/roller/`supabase_realtime` uyumluluk katmanıyla uygulandı (171/172 hatasız; `20260918100000` sabit prod klinik UUID'li bir veri düzeltmesi olduğundan geçici klinikle çalıştırıldı, katalog tohumu alındı). Ortaya çıkan katalogdan temel şema yazıldı ve **Supabase katmanı olmayan boş bir Postgres'e** kurulup denendi.

## Sonuç sayıları (kurulu veritabanında)
90 tablo (86 uygulama + 4 kimlik/oturum) · 10 view/matview · 106 fonksiyon (83'ü SECURITY DEFINER, hepsinde `search_path` sabit) · 141 tetikleyici · 306 politika · **76 tabloda FORCE RLS**. Envanterdeki "≈88 tablo / ≈125 fonksiyon" tahminine karşı gerçek: 86 uygulama tablosu (+4 kimlik) ve 100 uygulama fonksiyonu (+ bağlam/kimlik).

## Eşleme tablosu
| Supabase | Hedef |
|---|---|
| `auth.uid()` (145 kullanım) | `app_kullanici_id()` = `current_setting('app.user_id')` |
| `current_klinik_id()` (eskiden `kullanici`'dan okurdu) | `app.tenant_id` ayarı |
| `current_rol()`, `is_super_admin()`, `current_hasta_id()` | Kullanıcının KENDİ satırından okunur (`sahip_kendi_satir` politikaları); `db/arac/baglam-fonksiyonlari.sql` |
| `auth.role() = 'service_role'` | `sistem_baglami()` = `session_user = 'bakim_rolu'` (RLS'i atlamaz) |
| `auth.users` (FK'lar) | `kimlik_kullanici` (Better Auth user) |
| (yeni) session / account / verification | `oturum` (cihaz_kimligi, son_etkinlik), `kimlik_hesap` (argon2), `kimlik_dogrulama` — Better Auth alan eşlemesi Aşama 4'te kütüphane sürümüne karşı doğrulanacak |
| rol `authenticated` / `anon` / `service_role` | `klinik_uygulama` / `klinik_anonim` / kalktı (sistem işi `bakim_rolu`) |
| `storage.*` (3 bucket, 6 migration dosyası) | Alınmadı → Aşama 5 (disk) |
| `supabase_realtime` publication | Alınmadı → Aşama 6 (NOTIFY) |
| `oturum_kilidi` + `oturum_anahtari_yenile` | Alınmadı (özellik ertelendi) |

## FORCE RLS
Tüm `klinik_id`'li tablolar + `klinik` FORCE. İstisna (tenant'sız): `pozisyon_sablonlari`, `hiz_siniri_sayac` (doğrudan GRANT yok, yalnız fonksiyon). `klinik_id` NULL olabilen karma tablolar (`resmi_tatil`, `olcek_tanimi`, `egzersiz_kutuphanesi`, `audit_log`, bazı talep tabloları) FORCE'lu; sahip politikası NULL satırları (platform kataloğu) da kapsar.

**Sahip politikası** (`sahip_aktif_tenant`): DEFINER fonksiyon/tetikleyici sahibi `klinik_sahip` de yalnız aktif `app.tenant_id`'nin satırına dokunabilir; tenant'lar arası erişim yok. Sonuç: klinik oluşturan akış önce `app.tenant_id`'yi yeni klinik id'sine ayarlamalı (denendi, çalışıyor).

## Aşama 2 sertleştirmesi (2026-10-27)
- **Roller**: `klinik_uygulama` (RLS'e tabi, daraltılmış), `klinik_anonim` (min.), `kimlik_rolu` (yalnız 4 kimlik tablosu), `klinik_tanima` (NOLOGIN; `tanima` şeması), `bakim_rolu` (BYPASSRLS değil), `klinik_yedek` (tek BYPASSRLS, yalnız SELECT — onaylandı). Varsayılan yetkiler kapalı (`ALTER DEFAULT PRIVILEGES … REVOKE`, `REVOKE ALL … FROM PUBLIC`).
- **Tablo yetkileri koddan türetilir** (`scripts/dev/kullanim-tara.mjs` → `db/arac/kod-kullanimi.json`): 86 uygulama tablosundan 69'u klinik_uygulama'ya (52 yazma, 17 salt-okuma; 16 tabloda DELETE), 17'si hiç yetkisiz (kodda doğrudan kullanılmıyor; yalnız RPC/tetikleyici). Eski `authenticated` yetkisi üst sınırdır, aşılmaz. Matris: `docs/yetki-matrisi.md`.
- **Değişen/eklenen nesneler**: `0004` — `tanima` şeması (`klinik_qr_bilgisi_getir`, `randevu_klinik_cozumle`), `qr_kodu_aktif_mi` ve `personel_puantaj_donemi_acik_mi` güvenli-kapalı; kaldırılan `personel_giris_epostasi`, `portal_giris_epostasi`; INVOKER'a çevrilen `personel_izin_is_gunu_sayisi`. Ayrıntı: `docs/definer-siniflama.md`.
- **Kalan sınırlar**: yetki taraması statiktir (yeni/dinamik tablo adı eklenirse tarayıcı "belirsiz" listeler; uygulama taşınırken eksik yetki "permission denied" ile görünür ve `ELLE` tablosuna/koda eklenir). Kolon düzeyinde daraltma yalnız `klinik_muhasebe_entegrasyonu` için.

## Yetkiler (ilk sürüm notu — yukarıdaki sertleştirme bunu geçersiz kılar)
`PUBLIC`'ten tüm tablo/fonksiyon yetkisi alındı. (eski not: `klinik_uygulama` ilk sürümde `authenticated` yetkilerinin aynısıydı; artık daraltıldı.) `klinik_anonim` yalnız AÇIKÇA anon'a verilen politikaların tablolarında (`hasta`, `hasta_hassas`, `anket_yaniti`, `is_basvurusu`, `seans_degerlendirme`) ve QR/anket fonksiyonlarında. `bakim_rolu`: `klinik(id, ad)` SELECT, `resmi_tatil` yazma, `audit_log_bolum_olustur`; `klinik_uygulama`'ya `INHERIT FALSE, SET TRUE` üyelik.

## Alınmayanlar
`audit_log_eski`, `oturum_kilidi`, `_gecici_rol_probe`, `current_musteri_id`, PIN RPC'leri ve kolonları (bekleyen migration baz alındı), aylık `audit_log_*` bölümleri (kurulumda `audit_log_bolum_olustur(3)` açar), eski `musteri_*` adları.

## Doğrulananlar (gerçek Postgres 18, iki klinikli deneme)
- Boş Postgres'e roller → DB → eklentiler → 0001–0003 → tohum → bölüm açma hatasız.
- `klinik_uygulama` + K1 bağlamı: yalnız K1 hastası ve K1 kliniği görünür; K2 satırı görünmez; K2'ye yazma RLS ile reddedilir; bağlamsız 0 satır.
- `klinik_anonim`: `hasta` SELECT yok; self-servis INSERT politika şartı sağlanmadan reddedilir. **Olumlu yol (KVKK tarihli geçerli QR kaydı) denenmedi.**
- `bakim_rolu`: BYPASSRLS değil; `klinik` listesi 2 satır; `hasta`/`kullanici` doğrudan yetki yok; `SET ROLE klinik_uygulama` + tenant ile klinik başına çalışıyor; `sistem_baglami()` true.
- `bypassrls-kontrol.sql`: rol/fonksiyon sahipliği ve FORCE kontrolleri temiz (test kümesinde yalnız deneme düzeneğine ait `service_role` rolü işaretlendi; gerçek sunucuda olmaz).
- İlk denemede bağlam fonksiyonlarına EXECUTE verilmediği ortaya çıktı (her sorgu "permission denied"); `0003`'e eklendi.

## Doğrulanmadı / açık
- **Fonksiyon gövdeleri**: 83 DEFINER fonksiyondan yalnız birkaçı çalıştırıldı. FORCE altında tenant bağlamsız veya başka kullanıcının satırını okuyan gövdeler sessizce 0 satır görebilir → Aşama 3'te modül modül denenecek (`docs/service-role-siniflama.md` (b)/(c) satırlarıyla). Özellikle: `portal_giris_epostasi`, `personel_giris_epostasi` (kimlik tablosuna bağlı, Aşama 4), `mesaj_kredi_senkronla`, `personel_puantaj_donem_kapat`, `odeme_olustur`, `randevu_*` RPC'leri.
- `scripts/db-kur.ps1` Windows'ta `psql` ile **çalıştırılmadı** (bu makinede psql yok).
- Tohum veri yalnız 4 tenant'sız katalog (resmi_tatil 27, egzersiz 10, pozisyon şablonu 28, ölçek 6).
- Üretim düzeneği artık repoda: `scripts/dev/` ve `docs/sema-uretim.md`.

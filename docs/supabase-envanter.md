# Supabase Envanteri (Aşama 0)

Tarih: 2026-10-26 · Dal: `tasima/windows-postgres` · Kaynak: kod (`grep`) + `supabase/migrations/` (172 dosya) metin taraması.

**Yöntem ve sınır**: Canlı veritabanına BAĞLANILMADI; sayılar migration metninden ve kaynak koddan çıkarıldı. Migration'larda yeniden adlandırma/silme olduğu için "migration'da geçen" ile "canlıda var olan" arasında fark olabilir; kesin katalog sayımı Aşama 1'de (boş Postgres'e baseline kurulunca) ve Aşama 10'da (kaynak canlı DB `\d`/`pg_catalog` dökümü) yapılacak. Bu belgede "≈" işaretli sayılar bu belirsizliği taşır.

## 1. Özet sayılar (ve plandaki yaklaşık değerlerle fark)

| Kalem | Gerçek (taramada) | Planda yazan | Fark / not |
|---|---|---|---|
| `@supabase/*` veya `lib/supabase` import eden dosya | **161** (yalnız 14'ü doğrudan `@supabase` paketinden; kalanı `lib/supabase/*` sarmalayıcıları) | ~161 | Aynı |
| `.from('…')` kullanan dosya | **134** (73 farklı tablo/view adı) | ~135 | Aynı |
| Farklı `.rpc()` adı | **50** (42 dosyada çağrılıyor) | ~50 | Aynı |
| PostgREST embed'i olan `select` (parantezli) | **≈32 dosya** | (yoktu) | Yeni: embed'ler JOIN'e dönecek |
| `createAdminClient` (service role) kullanan dosya | **22** | (yoktu) | Yeni: bunlar RLS'siz çalışıyor; hedefte `bakim_rolu`'ne DEĞİL, açık tenant bağlamlı yola çevrilecek |
| `auth.getUser/getClaims/getSession` kullanan dosya | **83** | ~80 (auth çağrısı) | Aynı mertebe |
| `auth.signIn/signOut/updateUser/…` | **6 dosya** | — | |
| `auth.admin.*` | **3 dosya** | — | Kullanıcı oluşturma/ban/silme |
| Realtime (`channel`/`postgres_changes`/`setAuth`) | **3 dosya**, 3 kanal (`randevu-oda-{id}`, `randevu-panel-canli`, `randevu-bildirimleri`), hepsi yalnız `randevu` tablosu | 3 dosya | Aynı |
| Storage (`.storage`) | **6 dosya**, 3 bucket (`klinik-logo` **public**, `hasta-belge`*, `personel-belge`) | 6 dosya; "4 migration'da storage.objects" | Migration tarafı **6 dosya** (plan 4 demişti) |
| Migration dosyası | **172** (+1 `supabase/bekleyen/`) | 172 | Aynı |
| `auth.uid()` | **145 kullanım**, 68 migration dosyasında | "~157 yerde `auth.uid()`/`auth.users`" | Gerçek: 145 `auth.uid()` + 12 `auth.users` + 12 `auth.jwt()/auth.role()` = 169 kullanım (**68 dosya**) |
| `auth.users`'a FK veren tablo | `kullanici`, `hasta_kullanici`, `oturum_kilidi` (+ `personel_giris_epostasi` RPC'si `auth.users`'ı JOIN'ler) | — | Better Auth `user` tablosuna FK olarak yeniden bağlanacak |
| `CREATE TABLE` (migration) | 98 ifade → **≈88 canlı** tablo (14 `musteri_*` → `hasta_*` yeniden adlandırma, `personel_maas_gecmisi` → `personel_ucret`, 10 tablo silinmiş) | — | `audit_log` aylık partition'lı (+ `audit_log_varsayilan`; aylık bölümler RPC ile üretilir, migration'da yok) |
| View / matview | **≈10 view + 1 matview** (`mv_hasta_ilerleme`) | — | Matview RLS desteklemez, ham erişim REVOKE'lu |
| Fonksiyon (`CREATE FUNCTION` adı) | **≈125** farklı ad; **85 migration dosyası** `SECURITY DEFINER` içeriyor | — | |
| Trigger | **≈132** ad | — | Birçoğu `derive_klinik_id_from_parent` / `audit_log_yaz` |
| `CREATE POLICY` | **≈264** ad | — | Hepsi `auth.uid()`/`current_klinik_id()` zincirine bağlı |
| `ENABLE ROW LEVEL SECURITY` | **99** ifade; **`FORCE` = 0** | — | Hedef: tüm tenant tablolarında FORCE |
| Extension | `btree_gist`, `pg_trgm`, `pgcrypto` (ikisi 2'şer migration'da) | — | `pgcrypto`: CLAUDE.md "YOK" diyor ama extension kurulu ve RPC'ler `search_path = public, extensions` kullanıyor. Hedefte her üçü kurulacak; `gen_random_uuid` Postgres çekirdeğinde |
| `pg_cron` / `pg_net` | **Kullanılmıyor** (yalnız yorumlarda geçiyor) | — | Cron tamamen Vercel/HTTP tabanlı |
| Cron route | **5**; `vercel.json`'da kayıtlı **yalnız 3** | 5 | `mesaj-kuyruk-isle` ve `kredi-senkron` bilinçli kayıtsız (merkez zamanlayıcı çağırıyor). Hedefte ikisi de Task Scheduler'a girer |
| PDF route | **3** (`hasta-kayit-formu`, `is-basvuru-formu`, `hasta-cari-hareketler`) | 2 form | **Plan "2 PDF formu" diyordu; kodda 3 PDF route var** (üçüncü cari hareketler). `vercel.json > functions` + `outputFileTracingIncludes` üçü için tanımlı |
| Diğer API route | `destek-chatbot`, `hasta-arama`, `hasta-belge/foto-yukle`, `oturum-cikis` | — | |
| Sayfa / server action | **74** `page.tsx`; **48** `"use server"` dosyası (47 `actions.ts`/`*-actions.ts`) | — | |
| Mesaj tetikleyicisi (`lib/mesaj/tetikleyiciler.ts`) | **28** | **27** (CLAUDE.md) | CLAUDE.md düzeltildi (28) |

\* **Sapma (migration'sız değişiklik)**: hiçbir migration `hasta-belge` bucket'ını açmıyor; migration'lar yalnız `musteri-belge` (+ onun `storage.objects` politikaları, `20260729100000`) tanımlıyor, kod ise `hasta-belge` kullanıyor. CLAUDE.md belge akışının çalıştığını söylediği için bucket ve politikaların Supabase panelinden/elle yeniden adlandırıldığı varsayılıyor. Aşama 10'dan önce canlı `storage.buckets` ve `pg_policies` dökümüyle doğrulanmalı; baseline `hasta-belge` yolunu esas alır.

## 2. Ortam değişkenleri

| Değişken | Durum | Hedefte |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | kullanılıyor (4 + 3 yer) | **Kalkar** |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` | **Kalkar** |
| `SUPABASE_DB_PASSWORD` | yalnız yerel `.env.local` (bakım/psql) | Kalkar; yerine `DATABASE_URL` (uygulama rolü) ve bakım için ayrı `BAKIM_DATABASE_URL` (yalnız Task Scheduler betikleri) |
| `MESAJ_MERKEZ_BASE_URL`, `MESAJ_MERKEZ_API_KEY` | `lib/mesaj/merkez-client.ts` (henüz girilmedi) | Kalır |
| `CRON_SECRET` | `lib/cron-yetki.ts` | Kalır (Task Scheduler gizli başlığı) |
| `PUPPETEER_EXECUTABLE_PATH` | `lib/pdf/browser.ts` | **Yeniden adlandırılır → `CHROMIUM_PATH`** |
| `VERCEL`, `AWS_LAMBDA_FUNCTION_NAME` | `lib/pdf/browser.ts` ortam algılaması (Lambda'da `@sparticuz/chromium`) | **Kalkar** (+ `@sparticuz/chromium` bağımlılığı) |
| `ENTEGRASYON_ONAY`, `ANALYZE`, `NODE_ENV` | betik/geliştirme | Kalır |
| (yeni) `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `DOSYA_KOKU`, `YEDEK_*` | — | Eklenecek; yalnız adları belgelenir (`docs/sunucu-kurulum.md`) |

Chatbot yapay zekâ çağrısı `ai` paketiyle gateway üzerinden (`"anthropic/claude-sonnet-5"`); ayrı env gerektirmiyor (Vercel OIDC). Taşıma boyunca özellik kapalı (bkz. plan, karar 2).

## 3. Sınıflandırma: her Supabase kullanımı → hedef karşılığı

| Sınıf | Kapsam | Hedef | Aşama |
|---|---|---|---|
| Sorgu (`.from`) | 134 dosya, 73 ad | Drizzle + `withTenant`; embed'ler açık JOIN/ayrı sorgu; `.in()`/`max_rows`/`parcalara()`/`tumSayfalariOku` yerine normal SQL sayfalama | 3 |
| RPC (`.rpc`) | 50 ad, 42 dosya | `select fn(...)` (Drizzle `sql`); fonksiyonlar baseline'a taşınır | 2–3 |
| Auth (okuma) | `auth.getUser` vb. 83 dosya (`gecerli-kullanici.ts`, `gecerli-hasta.ts`, `eylem-yetkisi.ts`, `sayfa-yetkisi.ts`, `proxy.ts`…) | Better Auth oturum okuma; tek yardımcı arkasına | 4 |
| Auth (yazma/yönetim) | `signIn/signOut/updateUser` 6 dosya, `auth.admin` 3 dosya | Better Auth credentials, argon2; kullanıcı oluşturma/ban/silme için kendi servis katmanı | 4 |
| Auth (SQL) | `auth.uid()` 145, `auth.users` 12, `auth.jwt/role` 12 (68 dosya) | `current_setting('app.user_id', true)` / `app.tenant_id`; `auth.role()` kontrolleri yeniden tasarlanır | 2 |
| Storage | 6 dosya, 3 bucket | Dosya sistemi + yetkili route; `klinik-logo` (public) için ayrı kural | 5 |
| Realtime | 3 dosya, yalnız `randevu` | SSE + LISTEN/NOTIFY | 6 |
| Service role | 22 dosya `createAdminClient` | Her biri tek tek incelenir: anon akışlar (QR, hız sınırı, portal girişi, iş başvurusu), cron'lar, kullanıcı yönetimi | 3–4–7 |
| Cron | 5 route | Task Scheduler | 7 |
| PDF | `lib/pdf/browser.ts` + 3 route | sistem Chrome/Edge (`CHROMIUM_PATH`) | 7 |
| E-posta/SMS/WhatsApp | `lib/mesaj/*` → merkez | Merkez kalır; e-posta şablon kuralı | 7 (`docs/kvkk-aktarim.md`) |
| LLM | `app/api/destek-chatbot/route.ts` | Kapalı (flag) | 3/7 |

## 4. Veritabanı nesneleri (migration'dan, ≈)

**Tablolar (≈88 canlı)**: anket_yaniti, audit_log (+ varsayılan/aylık bölümler), cihaz, destek_talebi, egzersiz_kutuphanesi, ev_egzersiz_kalemi/programi/takip, fatura, hasta, hasta_anamnez, hasta_anket, hasta_bakiye_hareket, hasta_belge, hasta_hassas, hasta_hedef, hasta_iletisim_log, hasta_iliski, hasta_kullanici, hasta_olcum, hasta_onam, hasta_protokol, hasta_sigorta, hasta_vucut_haritasi_isareti, hasta_yorum, hiz_siniri_sayac, is_basvurusu, iskonto_oranlari, islem_adimi_sablonu, islem_kategori, islem_kontrendikasyon, islem_tanimi (+ _adim, _fiyat_gecmisi), kamusal_odeme, kasa_dengeleme, klinik, klinik_arac, klinik_ayarlar, klinik_banka_hesaplari, klinik_cari_odeme, klinik_harcama, klinik_kredi_karti_odeme, klinik_kredi_kartlari, klinik_muhasebe_entegrasyonu, kullanici, mesaj_kredi_hareketleri, mesaj_kredileri, mesaj_kurallari, mesaj_kuyrugu, nakit_banka_hareketi, oda, odeme (+ _kalemi, _satiri), olcek_tanimi, oturum_kilidi, paket, paket_satis, periyodik_randevu, personel (+ _acil_kisi, _egitim, _hassas, _hesap_hareket, _izin_talebi, _mesleki_belge, _puantaj, _puantaj_donem, _ucret, _vardiya_atama), pozisyon_sablonlari, pozisyonlar, randevu (+ _checklist, _cihaz_rezervasyon, _iptal_talebi, _on_form, _talebi), resmi_tatil, resmi_tatil_oneri, seans_checklist_sablonu, seans_degerlendirme, tedavi_protokolu (+ _adimi), terapist, vardiya_turu.

> Ham `grep` listesinde 14 eski `musteri_*` adı da görünüyor; bunlar `20260730110000_musteri_hasta_yeniden_adlandirma.sql` ile `hasta_*`'ye döndü. Kodda kullanılan ama ham `CREATE TABLE` listesinde olmayan `hasta*`/`personel_ucret` adları bu yeniden adlandırmadan gelir.

**View**: `v_hasta_ozet`, `v_hasta_detay_ozet`, `v_hasta_cari_ozet`, `v_hasta_ilerleme`, `v_hasta_karsilastirma`, `v_personel_bilgi_durumu`, `v_personel_hesap_bakiye`, `v_personel_izin_bakiye`, `klinik_kredi_karti_hareketleri`; matview `mv_hasta_ilerleme`.

**Fonksiyon aileleri**: yetki yardımcıları (`current_klinik_id`, `current_hasta_id`, `current_musteri_id` *eski ad, kalıntı olabilir*, `current_rol`, `is_super_admin`) · klinik-id türetme/denetim trigger'ları (`derive_klinik_id_from_parent`, `*_klinik_id_ata`, `audit_log_yaz`, `audit_log_degisiklik_yaz`) · randevu RPC'leri (`randevu_gelis_isaretle`, `_iptal_et`, `_iptal_geri_al`, `_gelmedi_isaretle`, `_seans_bedelini_isle`, cihaz rezervasyon) · finans RPC'leri (`odeme_olustur`, `hasta_bakiye_hareket_borc_duzenle`, `klinik_cari_odeme_ekle`, `kasa/banka/kredi_karti_bakiye_once_toplam`, `rapor_donem_ozeti`, `rapor_yillik_ozet`) · personel (`personel_puantaj_*`, `personel_izin_*`, `personel_hesap_hareket_*`, **PIN RPC'leri** `personel_puantaj_pin_*` — `bekleyen/20261003110000_puantaj_pin_kaldir.sql` ile silinecek, baseline'a TAŞINMAMALI) · mesaj (`mesaj_kredi_*`, `mesaj_gonderim_kaydet`) · anon/QR (`hasta_qr_self_servis_mi`, `qr_kodu_aktif_mi`, `portal_giris_epostasi`, `personel_giris_epostasi`, `klinik_qr_*`, `hiz_siniri_kullan`) · oturum (`oturum_anahtari_yenile`) · arama/Türkçe (`hasta_ara`, `turkce_*`, `telefon_normalize`) · arşiv içe aktarma (`*_arsiv_ice_aktar`/`_ekle`) · `audit_log_bolum_olustur`. Kalıntı şüphesi: `_gecici_rol_probe` (geçici sondaj fonksiyonu; baseline'a alınmayacak).

**Supabase'e özgü nesneler (baseline'dan çıkarılacak/yeniden yazılacak)**: `auth.users` FK'ları · `storage.buckets` (3) ve `storage.objects` politikaları (6 migration dosyası) · `ALTER PUBLICATION supabase_realtime ADD TABLE randevu` · Supabase roller/grant'leri (`anon`, `authenticated`, `service_role`) · `auth.uid()/jwt()/role()` çağrıları · `supabase/config.toml`.

## 5. Planı etkileyen bulgular

1. **FORCE RLS + SECURITY DEFINER**: 85 migration dosyası DEFINER fonksiyon tanımlıyor. FORCE'ta fonksiyon sahibi de RLS'e tabi olur; yani DEFINER fonksiyonlar çağıran oturumdaki `app.tenant_id`'ye göre filtrelenecek. Bu çoğu RPC için doğru (tenant bağlamı zaten var) ama **tenant bağlamı olmayan** çağrılar (anon QR akışları, portal giriş telefon sorgusu, cron taramaları, hız sınırı) için tasarım gerektirir — bkz. plan, "RLS rolleri".
2. **22 service-role kullanımı** tek tek ele alınacak; "service role = her şeyi gör" kısayolu hedefte yok.
3. **PDF route sayısı 3** (planda 2 yazıyordu).
4. **Tetikleyici sayısı 28**, 27 değil.
5. **Cron**: 2 route Vercel'de zaten kayıtlı değil; hedefte 5'i de Task Scheduler'da, zamanlar UTC → İstanbul çevrimiyle (`0 3 1 * *` UTC = 06:00 İstanbul) yeniden yazılır.
6. **Kalıntılar**: `current_musteri_id`, `_gecici_rol_probe`, `islem_kategori`/`hasta_hedef`/`v_hasta_karsilastirma` (UI yok), PIN RPC'leri — baseline'a alınıp alınmayacağı Aşama 2'de karar verilir (öneri: taşıma sırasında sade tut, kalıntıları alma; `supabase/bekleyen` PIN silme migration'ı baseline'a uygulanmış gibi işlenir).
7. **Canlı katalog doğrulaması hâlâ gerekli**: bu envanter migration metninden; Aşama 10'dan önce canlı `pg_catalog` dökümüyle karşılaştırılacak (özellikle migration'sız elle yapılmış değişiklik var mı).

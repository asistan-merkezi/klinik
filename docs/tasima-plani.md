# Taşıma Planı: Vercel + Supabase → Windows Server VM + Postgres

Dal: `tasima/windows-postgres`. Kararlar: `CLAUDE.md > Hedef Altyapı ve Taşıma Kararları`.
İlgili belgeler: `docs/supabase-envanter.md` (Aşama 0 çıktısı, gerçek sayılar) · `docs/kvkk-aktarim.md` (aktarım ve e-posta taraması) · `docs/sunucu-kurulum.md` (roller, env adları, yedek ve geri yükleme).

## ÜRETİM KAPISI (canlıya çıkmadan ÖNCE kapanması gerekenler)

Hepsi kapanmadan canlı geçiş YAPILMAZ. Durum güncel tutulur (son: 2026-10-28).

| # | Kalem | Durum / not |
|---|---|---|
| 1 | **Seçenek B** — `user_id` güvencesi: oturum jetonunun DB'de doğrulanması (tenant türetme bugün `app.user_id`'ye güveniyor; bölüm "Bağlam güvenliği") | açık |
| 2 | **Modül 4b** — mali kayıt iptali (fiziksel silme kalkar, iptal bayrağı + gerekçe + ters kayıt) | tasarım hazır: `docs/modul-4b-4c-tasarim.md`; taşıma bittikten sonra kodlanır |
| 3 | **Modül 4c** — terapistin finans tablolarına RLS okumasının kapatılması (dar görünümler) | tasarım hazır; **Aşama 7b'nin ilk hedefi** |
| 4 | **Modül 4a** — iade sınırı (ödemeden büyük iade reddi) | kullanıcı yanıtı bekliyor (bağlantı modeli + istisna) |
| 5 | **KDV yuvarlama mali müşavir teyidi** — kural: `docs/tasima-ilerleme.md` Modül 4 §1 | teyit bekliyor |
| 6 | `db-kur.ps1` gerçek **Windows** üzerinde test | yapılmadı |
| 7 | **E-posta göndericisi** bağlanması (şablon verisi KVKK uyumu dahil, `docs/kvkk-aktarim.md`) | açık |
| 8 | **SSE oturum kontrolü** (`/api/canli` oturum/tenant yenileme ve iptal davranışı) | açık |
| 9 | **Yedek dış kopya hedefi** (Türkiye içi sağlayıcı/konum, anahtar saklama sorumluları) | açık |
| 10 | **Hukuk onayları**: yedek saklama süreleri, yurt dışı şifreli depolama, mesaj şablonlarının KVKK sınıflandırması, `audit_log` saklama/arşiv süresi | açık |
| 11 | `GIZLI_VERI_ANAHTARI` üretimi ve saklaması (rotasyon prosedürü `docs/sunucu-kurulum.md` §7) | prosedür yazıldı; anahtar üretimi canlı kurulumda |

## Alınan kararlar (2026-10-26)

1. **Parolalar**: mevcut hesaplar için **toplu sıfırlama**. bcrypt doğrulama / argon2 yükseltme kodu YAZILMAYACAK. Test ve pilot hesapları yeniden oluşturulacak.
2. **Destek chatbotu**: taşıma boyunca **kapalı** (feature flag). Sonra açılırsa kişisel ve sağlık verisi LLM'e hiç gönderilmeyecek. **Taşıma kapsamından çıkarıldı.**
3. **E-posta**: Resend (EU) kalır. E-posta şablonlarında kişisel/sağlık verisi olmayacak, yalnız bağlantı odaklı metin. Tüm şablonlar `docs/kvkk-aktarim.md`'de tarandı: **28/28 ihlal ediyor** (henüz canlı kural yok).
4. **Tek oturum kilidi**: taşımadan **sonraya ertelendi**; özellik şimdi yazılmayacak. Oturum tablosu buna sonradan izin verecek şekilde tasarlanır (cihaz/oturum kimliği saklanır).
5. **Yedek**: günlük **30 gün** + aylık **12 ay** saklama (hukuk onayına tabi, parametre). Şifreleme anahtarı sunucuda saklanmaz; `yedek.ps1` yalnız ortak anahtarı ortam değişkeninden alır; geri yükleme testi sunucu kurulum dokümanında zorunlu adım. Ayrıntı: `docs/sunucu-kurulum.md`.
6. **FORCE ROW LEVEL SECURITY**: tüm tenant tablolarında açık. Migration ve cron bakım işleri için ayrı **`bakim_rolu`**; uygulama bağlantısı bu rolü asla kullanmaz.

7. **Cron/arka plan işleri HTTP route olarak kalmıyor.** 3 cron (`personel-donem-otomatik-kapat`, `audit-log-bolum-olustur`, `resmi-tatil-guncelle`) ve diğer arka plan işleri (`mesaj-kuyruk-isle`, `kredi-senkron`) `scripts/` altında Node betiği; Task Scheduler çağırır; `bakim_rolu` ile bağlanır (yalnız `klinik` üzerinde SELECT), klinik başına iş `withTenant` ile. **Hiçbir BYPASSRLS'li fonksiyon yazılmaz.** `/api/cron/*` route'ları ve `CRON_SECRET` kaldırılır. `bakim.env` için NTFS izinli ayrı dosya tasarımı: `docs/sunucu-kurulum.md`. *Uygulama notu*: bakim_rolu NOBYPASSRLS tasarlandı (bakım işi de RLS'ten geçer); sistem bağlamı `session_user = 'bakim_rolu'` ile tanınır.
8. **Service role**: 22 dosyadaki her kullanım `docs/service-role-siniflama.md`'de (a) sistem işi → bakim_rolu betiği, (b) kullanıcı bağlamı → `withTenant`, (c) oturum öncesi → dar tek amaçlı fonksiyon olarak sınıflandı. Bu sınıflama **Aşama 3 ve 7b'nin ilk hedefidir**.
9. **Dosya depolama**: kodun kullandığı ad `hasta-belge` esas; katalog doğrulaması gerekmiyor (canlı veri yok). `musteri-belge` ve klinik logosu da aynı disk depolamasında; hepsi yetkili route'tan servis edilir (public dosya yok).
10. **Cloudflare**: klinik için proxy KAPALI (yalnız DNS); TLS Cloudflare'de sonlanırsa sağlık verisi yurt dışında çözülmüş geçer. KVKK notu CLAUDE.md ve `docs/sunucu-kurulum.md`'de.
11. **Yedek dış kopya**: önce Türkiye içi hedef (hedef seçimi açık karar); yurt dışı şifreli depolama hukuk onayına bağlı.
12. **SMS/WhatsApp**: mesaj içeriğinde kişisel/sağlık verisi olmayacak (e-posta kuralıyla aynı). `docs/kvkk-aktarim.md` taraması tüm kanallara genişletildi (28/28 ihlal, canlı kural yok).

## Aşama 0 sonucu (envanter) — plandaki yaklaşık sayılardan farklar

Ayrıntı: `docs/supabase-envanter.md`. Sayılar migration metni + koddan; canlı DB kataloğuyla doğrulama Aşama 10 öncesi.

- Kod tarafı beklenenle örtüştü: 161 import dosyası, 134 `.from` dosyası, 50 RPC adı, 3 realtime dosyası (yalnız `randevu`), 6 storage dosyası, 172 migration, 5 cron route.
- **Farklar**: PDF route **3** (planda 2); tetikleyici **28** (CLAUDE.md 27); migration'da `storage.objects` **6 dosya** (planda 4); `auth` kullanımı 68 migration dosyasında 145 `auth.uid()` + 12 `auth.users` + 12 `auth.jwt/role`; **22 dosya service-role** (`createAdminClient`) kullanıyor (planda yoktu); `vercel.json`'da yalnız 3 cron kayıtlı.
- **Yeni bulgular**: (a) `hasta-belge` bucket'ını hiçbir migration açmıyor (yalnız `musteri-belge`) → migration'sız değişiklik, canlı katalogla doğrulanacak; (b) 85 migration dosyası SECURITY DEFINER içeriyor → FORCE RLS tasarımını etkiler (aşağıda); (c) kalıntı nesneler: `current_musteri_id`, `_gecici_rol_probe`, PIN RPC'leri; (d) `pgcrypto` kurulu (CLAUDE.md "YOK" diyordu, yalnız kullanılmıyor olabilir).

## Ana riskler

1. **RLS'in `auth.uid()`'ye bağlı olması** (145 kullanım, 68 dosya; ≈264 politika). Hepsi `app.user_id` / `app.tenant_id` modeline çevrilmeli; biri atlanırsa ya veri sızar ya da sessizce 0 satır döner.
2. **`SET LOCAL` + bağlantı havuzu**: yalnız transaction içinde geçerli; tek sarmalayıcı (`withTenant`) dışında DB erişimi olmamalı.
3. **FORCE RLS + SECURITY DEFINER**: FORCE'ta sahip dahil herkes RLS'e tabi; fonksiyon sahibi `klinik_sahip` (BYPASSRLS değil) olduğundan DEFINER fonksiyonlar RLS'i **atlamaz** — başka kullanıcının satırını görmesi gerekiyorsa bu politika + kolon GRANT'iyle açıkça verilir (`docs/service-role-siniflama.md`, #14, #15). Tenant bağlamı olmayan yollar: anonim akışlar (dar `klinik_anonim` politikası/fonksiyonu) ve sistem işleri (bakim_rolu betiği: klinik listesi + klinik başına `withTenant`). `bakim_rolu` BYPASSRLS değildir; tek BYPASSRLS rolü `klinik_yedek`'tir (pg_dump gereği, onay bekliyor).
4. **PostgREST'e gömülü davranışlar kaybolur**: ≈32 dosyada embed, `max_rows`, kolon GRANT'leri, `.insert().select()` RLS davranışı. 134 dosyada sorgu yeniden yazılır.
5. **Auth kimlik göçü**: karar gereği toplu sıfırlama (kod yok). Risk kullanıcı tarafında: sıfırlama duyurusu, personel/portal hastalarına geçici şifre dağıtımı (portal şifresi bugün 8 karakterli geçici şifre mantığıyla zaten üretiliyor), test/pilot hesapların yeniden kurulması, **sentetik portal e-postası** (`m-{hasta.id}@portal.local`) ve personel telefon girişi akışının Better Auth'ta karşılığı.
6. **Realtime**: `postgres_changes` yerine SSE+NOTIFY; NOTIFY yükünde veri taşınmaz (yalnız `klinik_id` + id), istemci yetkili sorguyla çeker.
7. **Windows işletim riskleri**: NSSM çökme/yeniden başlatma, Caddy sertifika yenileme (80/443), Windows güncelleme reboot'ları, Task Scheduler saat dilimi (mevcut cron saatleri UTC), yol/büyük-küçük harf, Chrome/Edge sürümü.
8. **KVKK**: e-posta şablonlarının tamamı kuralı ihlal ediyor (ilk kural açılışından önce düzeltilmeli); chatbot kapalı; yedekler şifreli, anahtar sunucuda yok; erişim logu.
9. **Tek VM = tek hata noktası**: geri yükleme tatbikatı yapılmadan canlıya geçilmez.
10. **Canlı veri kesintisi / geri dönüş** (Aşama 10).
11. **Migration'sız sapma**: envanter migration metninden; canlı katalog ile fark çıkabilir (bucket adı örneği).

## Aşamalar

Her aşama `npx tsc --noEmit` + `npm run lint` + `next build` temiz bitmeli. Gizli değer hiçbir dosyaya yazılmaz.

### Aşama 0 — Envanter ✅ (2026-10-26)
- Çıktı: `docs/supabase-envanter.md`, `docs/kvkk-aktarim.md`.
- **Bitti kriteri (karşılandı)**: envanter commit'li; her kalemin hedef karşılığı tabloda; grep sayıları dosya listesiyle tutuyor. **Kalan**: canlı `pg_catalog`/`storage.buckets`/`pg_policies` dökümüyle karşılaştırma (Aşama 2 başında, salt-okunur) ve fark listesi.

### Aşama 1 — Hedef sunucu ve Postgres kurulumu
- Windows Server VM, Node.js LTS, PostgreSQL, NSSM, Caddy; güvenlik duvarı yalnız 80/443; Postgres yalnız localhost. Ayrıntı: `docs/sunucu-kurulum.md`.
- Roller: `klinik_sahip`, `klinik_uygulama` (NOBYPASSRLS), `klinik_anonim`, **`bakim_rolu`** (BYPASSRLS; yalnız migration/bakım betikleri), `klinik_yedek`.
- **Bitti kriteri**: boş Next.js sayfası Caddy + NSSM arkasında alan adıyla TLS'te açılıyor; VM reboot'ta servis kendiliğinden kalkıyor; `\du` çıktısında yalnız `bakim_rolu` ve `klinik_yedek` BYPASSRLS taşıyor, `klinik_uygulama` sahip değil; uygulamanın ortamında `BAKIM_DATABASE_URL` yok (kanıt: servis env dökümü, değerler gizli).

### Aşama 2 — Şema taşıma (Supabase'siz düz Postgres) — ✅ ilk sürüm + sertleştirme (2026-10-27)
Çıktılar: `db/migrations/0001–0004`, `db/seed/`, `db/kurulum/`, `db/kontrol/`, `docs/sema-esleme.md`, `docs/sema-uretim.md`, `docs/yetki-matrisi.md`, `docs/definer-siniflama.md`, `docs/service-role-siniflama.md`, `scripts/db-kur.ps1` (Windows'ta psql ile denenmedi), `scripts/dev/` (üretim ve kontrol düzeneği). Sertleştirme: kimlik tabloları yalnız `kimlik_rolu`; `klinik_uygulama` yetkileri kodun kullandığı işlemlere daraltıldı; `klinik_anonim` minimum; giriş öncesi tenant'sız çözümleme için `klinik_tanima`/`tanima` şeması; DEFINER sınıflaması + üç durumlu duman testi.
- 172 migration'dan baseline: `auth.*`, `storage.*`, `supabase_realtime`, Supabase rolleri çıkar; kalıntıları (`_gecici_rol_probe`, `current_musteri_id`, PIN RPC'leri) alma. `auth.uid()` → `current_setting('app.user_id', true)::uuid`; `current_klinik_id()` / `current_hasta_id()` / `is_super_admin()` bu ayarlardan türer. `auth.users` FK'ları Better Auth `user` tablosuna.
- **FORCE ROW LEVEL SECURITY tüm tenant tablolarında**; tenant olmayan tablolar listelenip gerekçeli istisna. Anonim ve cron yolları için Risk 3'teki tasarım uygulanır. Fonksiyon/tablo sahipliği `klinik_sahip`; `bakim_rolu` migration'ı çalıştırır.
- `audit_log` partition tuzağı (partition başına RLS+grant) korunur.
- **Oturum tablosu** (Better Auth `session`) şu kolonlarla tasarlanır: oturum id, `kullanici_id`, **`cihaz_kimligi`** (tarayıcıda httpOnly cookie ile üretilen rastgele kimlik), ilk/son etkinlik zamanı, bitiş, IP (hash) ve user-agent; `(kullanici_id, son_etkinlik)` indeksi. Tek oturum kilidi şimdi YAZILMAZ; ileride "aynı kullanıcıda başka `cihaz_kimligi`'ne ait oturumu sonlandır" mantığı bu tablodan, şema değişikliği olmadan eklenebilir olmalı. Eski `oturum_kilidi` tablosu/RPC'si baseline'a alınmaz.
- **Bitti kriteri**: temiz Postgres'te baseline hatasız kurulur; `relforcerowsecurity` tüm tenant tablolarında true (sorguyla kanıt); iki klinik × her rol için `SET LOCAL` simülasyonu (ROLLBACK) geçer: başka klinik satırı görünmez/yazılamaz, bağlam yokken 0 satır döner, `klinik_uygulama` DEFINER fonksiyonlar dışında RLS'i atlayamaz; anonim akışların beklenen dar yazma/okuma sınırı doğrulanır (anon'a SELECT yok kuralı korunur).

### Aşama 3 — Veri erişim katmanı (Drizzle + pg) — 🟡 ALTYAPI TAMAM (2026-10-27), modül taşıma sürüyor
**Karar (giriş)**: Seçenek D uygulandı (`docs/giris-akislari.md` §3). **Yapılan**: `lib/db` (iki havuz, `withTenant/withKullanici/withAnonim/withTanima/withGlobal`, ESLint kısıtı, bakım yardımcısı), Drizzle şeması (üretilmiş), `lib/auth` (Better Auth 1.7.14, giriş/şifre/hesap akışları, `getSessionContext`), `proxy.ts` + `lib/auth/proxy-oturum.ts`, giriş/şifre sayfaları, anonim uç kapısı (`lib/guvenlik/anonim-uc.ts`) ve `0005` (anonim yazma boşluğu DB'de kapatıldı), hız sınırı fail-closed, 40 veritabanı testi. Kılavuz: `docs/platform-katmani.md`. **Kalan**: ~161 Supabase dosyasının modül modül taşınması, `docs/service-role-siniflama.md` (b)/(c) satırları, eski `lib/qr/hiz-siniri.ts`/`lib/auth/giris-hiz-siniri.ts`/oturum kilidi dosyalarının silinmesi, `ScheduledLogout`, e-posta göndericisi.
- **Anonim self-servis uçlar için zorunlu gereksinimler** (QR ön kayıt, anket, iş başvurusu, giriş öncesi sorgular; olumlu/olumsuz yol testi `db/kontrol/anonim-kayit-testi.mjs`):
  1. **Akış sırası**: `tanima.klinik_qr_bilgisi_getir(kısa kod)` (veya `tanima.randevu_klinik_cozumle`) → dönen klinik id'si `app.tenant_id` → `SET LOCAL ROLE klinik_anonim` → `qr_kodu_aktif_mi(klinik, tip)` (bağlam yoksa/yanlışsa false) → INSERT. `INSERT … RETURNING` çalışmaz (anon'a SELECT yok): kimlik sunucuda `crypto.randomUUID()` ile üretilir.
  2. **Hız sınırı** (her anonim yazma ve çözümleme ucunda, DB çağrısından ÖNCE): IP hash'i başına ve kısa kod başına ayrı sayaç (`hiz_siniri_kullan`); varsayılan öneri: kayıt başına IP'den 10 dk'da 5, kısa kod başına dakikada 30, iş başvurusunda IP başına saatte 3. **FAIL-CLOSED**: sayaç okunamazsa istek reddedilir (bugünkü kod fail-open; anonim yazma uçlarında değiştirilecek, yalnız giriş sonrası düşük riskli uçlarda fail-open kalabilir). Caddy katmanında ek IP başına istek sınırı (Cloudflare proxy kapalı olduğundan WAF yok).
  3. **Veritabanı sınırı (bilinen boşluk)**: `hasta_insert_qr_kayit` politikası `klinik_id`'nin QR'ı açık bir klinik olduğunu DB'de zorlamaz (yalnız kanal/KVKK alanlarını denetler); anonim bir istemci başka bir kliniğin UUID'sini bilirse oraya kayıt ekleyebilir (test: "yanlış tenant bağlamı → kabul"). Uygulama katmanı `qrKoduAktifMi` + tenant bağlamı ile korur; ek DB sertleştirmesi (politikaya `qr_kodu_aktif_mi(klinik_id,'hasta_on_kayit')` ve `klinik_id = current_klinik_id()`) Aşama 3'te bu uçlar taşınırken yapılacak ve testle doğrulanacak.
  4. Anonim uçlarda uzunluk sınırları (uygulama + DB CHECK) ve KVKK onayı korunur; telefon doğrulaması olmadığından `hasta_kayit_hosgeldin` bu uca bağlanmaz (mevcut karar).
- **İlk hedef**: `docs/service-role-siniflama.md` (22 dosya) — her satır (a)/(b)/(c) çözümüne taşınır; tablo güncel tutulur.
- `lib/db/`: havuz, `withTenant`, Drizzle şeması; modül modül sorgu taşıma. Embed → JOIN; `tumSayfalariOku`/`parcalara()` kalkar. 50 RPC → `select fn(...)`. 22 service-role kullanımı tek tek: anon akış / cron / kullanıcı yönetimi / kaldırılacak.
- **Chatbot kapatma**: `DESTEK_CHATBOT_ACIK` (varsayılan kapalı) bayrağı; kapalıyken menü öğesi gizli, `/panel/destek/chatbot` sayfası ve `/api/destek-chatbot` 404/403 döner, LLM çağrısı hiç yapılmaz. `ai` paketi/AI Gateway çağrısı bayrak arkasında kalır, taşıma kapsamında başka iş yapılmaz.
- **Bitti kriteri**: `grep -r "createAdminClient" .` boş ve sınıflama tablosundaki (b)/(c) satırlarının hepsi kapalı; `grep -r "@supabase\|lib/supabase" app lib components` boş; `withTenant` dışı DB erişimi yok (lint kuralı/test); mevcut vitest + entegrasyon betikleri geçer; kritik akışlar (randevu → check-in → seans bedeli → ödeme, hasta CRUD, kasa/banka bakiyesi) eski/yeni sistemde aynı rakam; bayrak kapalıyken chatbot rotaları erişilemez (kanıt: istek) ve ağ çağrısı yapılmaz.

### Aşama 4 — Auth (Better Auth)
- Better Auth credentials + argon2, oturumlar DB'de (Aşama 2 tablosu); rol/tenant her istekte DB'den. `proxy.ts`, `eylemYetkisiGetir`, `sayfaYetkisiIste`, `gecerli-kullanici.ts`, `gecerli-hasta.ts` yeni oturuma bağlanır. **Giriş akışı tek bir yardımcıda, `cihaz_kimligi` üretimi ve oturuma yazılması dahil.**
- Personel, hasta portalı, QR puantaj girişi (`/giris?donus=`), geçici portal şifresi, işten çıkışta hesabı kapatma (ban yerine giriş engeli + oturum iptali), giriş hız sınırı.
- **Parola göçü: toplu sıfırlama.** Kullanıcılar için ilk giriş şifre belirleme akışı (tek kullanımlık bağlantı/geçici şifre — e-posta kuralına uygun, veri içermez); **eski bcrypt hash'i okuyan/yükselten hiçbir kod yazılmaz**. Test/pilot hesaplar sıfırdan oluşturulur; Supabase `auth.users`'tan hiçbir hash aktarılmaz.
- **Bitti kriteri**: 5 rol + portal hastası gerçek tarayıcıda giriş/çıkış; yetkisiz rol sayfa ve action'da reddediliyor; işten çıkarılan kullanıcı giriş yapamıyor ve açık oturumu düşüyor; anon QR akışları kimliksiz çalışıyor; sıfırlama akışı denendi; kod tabanında bcrypt/Supabase hash okuma yok (`grep`); `session` tablosunda `cihaz_kimligi` doluyor.

### Aşama 5 — Dosyalar
- **Giriş öncesi logo**: tek amaçlı, önbellekli, tenant verisi dönmeyen `GET /api/logo/[kisaKod]` (tasarım: `docs/sunucu-kurulum.md` §3b2); oturumlu panelde yetkili `/api/dosya/logo`.
- `DOSYA_KOKU` (web kökü dışı), yol düzeni `{klinik_id}/{hasta_id}/{kategori}/{belge_id}.{ext}`; yalnız yetkili route servis eder (`hasta_belge_goruntule` kaydı korunur); yol gezinme ve MIME doğrulaması. Kök altında kodun kullandığı adlar esas: `hasta-belge` (eski `musteri-belge` içeriği dahil), `personel-belge`, `klinik-logo`; **logo dahil hiçbir dosya public değil**, hepsi yetkili route'tan servis edilir (klinik logosu için oturumlu `/api/dosya/logo`; giriş öncesi sayfada logo gerekiyorsa dar, yalnız logoyu döndüren route). Mevcut dosyalar Supabase'ten kopyalanır.
- **Bitti kriteri**: başka klinik/yetkisiz rol 403/404; terapist yükler+görür+silemez; yol gezinme reddedilir; taşınan dosya sayısı/boyutu kaynakla eşit (hash örneklemi).

### Aşama 6 — Realtime (SSE + LISTEN/NOTIFY)
- **Modül 2a — canlı olaylar (TAMAMLANDI, 2026-10-27)**: `0008_canli_olaylar.sql` — `randevu`, `randevu_talebi`, `randevu_iptal_talebi` üzerinde `canli_olay_bildir()` (INVOKER) tetikleyicisi; NOTIFY yükü YALNIZ `{t: tablo, i: id, k: klinik_id}` (durum/ad/not YOK; dinleyici başka şekli atar). `lib/realtime/`: süreç başına TEK `LISTEN` bağlantısı (havuz dışı, hata/kopma dinleyicili, üstel geri çekilmeli yeniden bağlanma; yeniden bağlanınca aboneler `yeniden` olayıyla telafi çeker), bellek içi klinik bazlı dağıtım, `GET /api/canli?t=…` SSE (oturumdan tenant; `?t=` yalnız izinli tablo seçer; portal/super_admin/geçici şifreli 403, oturumsuz 401, kullanıcı başına 5 akış sonrası 429, 25 sn ping, 10 dk bağlantı ömrü, 64 mesaj yavaş istemci sınırı). İstemci tek ortak kanca `useCanliOlaylar` (`onOlay` → yetkili yoldan yeniden çek, `onSenkron` → yeniden bağlanma/ağ dönüşü telafisi, 70 sn sessizlik izleyicisi, HTTP hatasında elle geri çekilmeli yeniden deneme); 3 tüketici (canli-cizelge, tablet-ekrani, randevu-bildirimleri) Supabase realtime'dan çıkarıldı — veri çekimleri Modül 2'de sunucuya taşınır. Caddy: `deploy/windows/Caddyfile` (`/api/canli` için `flush_interval -1`, sıkıştırma yok) + `docs/sunucu-kurulum.md` §3b3. Testler: `lib/realtime/realtime.test.ts` (12), `tests/db/canli-olaylar.test.ts` (5: yük şekli, gerçek yazma yolu, klinik izolasyonu, kopma+yeniden bağlanma+telafi, sözleşme dışı yük), `tests/e2e/canli.spec.ts` (3: 401/400, tarayıcıda gerçek NOTIFY→SSE ve klinik izolasyonu, hasta 403). tablet-sw.js etkilenmez (yalnız `navigate` ağ hatasını yönetir, SSE bir `navigate` değildir).
- **Bitti kriteri**: iki tarayıcıyla check-in tablete ve çizelgeye birkaç sn içinde yansır; başka klinik olayı gelmez; sunucu yeniden başlayınca istemci kendiliğinden bağlanır; 30+ dk açık tablette kopma yok.

### Aşama 7a — PDF, mesajlaşma kuralı, dış çağrılar
- PDF: 3 route (`@sparticuz/chromium` kalkar) → `puppeteer-core` + `CHROMIUM_PATH`; `vercel.json`/`outputFileTracingIncludes` kalıntıları temizlenir; Lambda/Vercel ortam algılaması kalkar.
- **Mesaj kuralı (e-posta, SMS, WhatsApp — tüm kanallar)**: `docs/kvkk-aktarim.md` önerisi uygulanır — kanal başına değişken beyaz listesi (`klinik_adi`, `baglanti`), veri içermeyen sabit konu, ek yok, kaydederken ve göndermeden önce doğrulama, bağlantı üreten imzalı/kısa ömürlü token mekanizması.
- Chatbot: kapalı kalır (Aşama 3 bayrağı); bu aşamada iş yok.
- **Bitti kriteri**: 3 PDF hedef sunucuda üretilip gözle doğrulandı; kuyruğa giren e-posta/SMS/WhatsApp metinlerinde ad/tarih/tutar/paket/izin türü yok (28 tetikleyici × 3 kanal test: yasak değişkenle kayıt reddediliyor, eski serbest metinli kural gönderimde engelleniyor); chatbot/LLM'e giden istek yok.

### Aşama 7b — Cron ve arka plan işleri → `scripts/` (Task Scheduler)
- **İlk hedef**: `docs/service-role-siniflama.md` (a) satırları (#17–21, #24, #25 tarama kısmı, #27).
- `scripts/` altında 5 Node betiği (`personel-donem-otomatik-kapat`, `audit-log-bolum-olustur`, `resmi-tatil-guncelle`, `mesaj-kuyruk-isle`, `kredi-senkron`) + ortak `scripts/lib/bakim-baglanti.ts` (bakim_rolu bağlantısı, klinik listesi, klinik başına `withTenant`). Task Scheduler tablosu ve `bakim.env` NTFS tasarımı: `docs/sunucu-kurulum.md`. `/api/cron/*` route'ları, `lib/cron-yetki.ts`, `CRON_SECRET` silinir. RPC'lerdeki `service_role` kabulü `sistem_baglami()`'na (`session_user='bakim_rolu'`) çevrilir.
- **Bitti kriteri**: her betik elle ve zamanlanmış çalıştırıldı, tekrar çalıştırma idempotent; `svc-klinik-uygulama` hesabı `bakim.env`'i okuyamıyor (kanıt: `runas` denemesi); `bakim_rolu` ile tenant bağlamı vermeden `hasta` SELECT'i 0 satır; `grep -r "api/cron\|CRON_SECRET"` boş; bakim_rolu'nün `klinik` dışında tablo SELECT yetkisi yok (`information_schema.role_table_grants` kanıtı).

### Aşama 8 — Güvenlik, KVKK, yedek, izleme
- Yedek: `docs/sunucu-kurulum.md` tasarımı (age ortak anahtarı sunucuda, özel anahtar dışarıda; günlük 30 gün + aylık 12 ay, parametre; sunucu dışı kopya **önce Türkiye içi**). Erişim logu (kim hangi hasta verisine baktı; log dosyalarında kişisel veri yok; döndürme). Sertleştirme: gelen yönetim portu yok, ortam değişkenleri yalnız servis hesabına, Cloudflare **proxy kapalı** (yalnız DNS; KVKK nedeniyle), bu yüzden WAF/DDoS yerine sunucu güvenlik duvarı + Caddy hız sınırı. İzleme: servis, disk/Postgres doluluğu, uptime.
- **Bitti kriteri**: sunucu kurulum dokümanındaki **geri yükleme testi** boş makinede yapıldı, rakamlar kaynakla tutuyor ve kayıt tutuldu; sunucuda özel anahtar yok (dosya/env/kayıt taraması) ve yedek anahtarsız açılamıyor; saklama parametreleri değiştirilince temizlik davranışı değişiyor (iki değerle denendi); dışarıdan yalnız 80/443 açık (port taraması); gizli değer repo ve loglarda yok.

### Aşama 9 — Deploy hattı (pull tabanlı)
- Sunucu etiket/dalı kendisi çeker (salt-okunur deploy anahtarı — dosyada yok), `npm ci` + `next build`, NSSM yeniden başlatma, başarısızlıkta önceki sürüme dönüş. Migration adımı ayrı, `bakim_rolu` ile, onaylı.
- **Bitti kriteri**: etiket atılınca sunucu kendisi yayınlıyor; bilerek bozuk sürümde otomatik geri dönüş çalıştı; sunucuya gelen yönetim bağlantısı olmadan tüm akış tamamlandı.

### Aşama 10 — Veri göçü ve geçiş
- Kesinti penceresi: Supabase'te yazma kapat → dump → yükle → doğrulama (satır sayıları, finans toplamları, bakiye view'ları, dosya sayısı, **canlı katalog ↔ envanter farkı kapalı**) → kullanıcılara şifre belirleme bağlantıları → DNS geçişi. Önce prova (staging kopyası). Geri dönüş: DNS'i eski Vercel'e çevirme + aradaki yazmaları elle aktarma planı.
- **Bitti kriteri**: provada tüm doğrulama sayıları eşit; gerçek geçişte kullanıcı kabul testi (resepsiyon, terapist, tablet, portal) geçti; 1–2 hafta sorunsuz çalışma sonrası Supabase/Vercel kapatılır; dal `main`'e birleştirme **kullanıcı onayıyla**.

## Bağlam güvenliği: tenant'ı DB tarafında türetme — SEÇENEK A UYGULANDI (2026-10-27)

**Karar**: Seçenek A uygulandı (`db/migrations/0007_tenant_turetme.sql`); B (oturum jetonunu DB'de doğrulama) üretim öncesi karar noktası olarak duruyor, C artık geçerli değil.

**Nasıl çalışıyor**
- `kullanici_tenant` eşleme tablosu (`kullanici_id, tur, klinik_id, rol, hasta_id, aktif`): **RLS'siz** ve **hiçbir uygulama rolüne yetki verilmemiş** (klinik_uygulama, klinik_anonim, bakim_rolu, kimlik_rolu, klinik_tanima: SELECT/INSERT/UPDATE/DELETE/REFERENCES yok; `yetki-matrisi.sql` kural 8 denetler). Tek yazan yol `kullanici` ve `hasta_kullanici` üzerindeki DEFINER tetikleyicilerdir (`kullanici_tenant_kullanici_esle`, `kullanici_tenant_hasta_esle`).
- `current_klinik_id()` (DEFINER, STABLE): oturumlu kullanıcıda (`app.user_id` dolu) tenant = eşleme satırındaki klinik; **`app.tenant_id` YOK SAYILIR**; eşlemesi olmayan/pasif kullanıcı → NULL. `current_rol()`, `is_super_admin()`, `current_hasta_id()` de aynı tablodan okur.
- `app.tenant_id` yalnız şu istisnalarda dikkate alınır: (1) **super_admin** (rol DB'den doğrulanır; klinik seçer), (2) **klinik_anonim** (tanima sonrası; `current_setting('role')` ile — SECURITY DEFINER içinde `current_user` sahip olduğundan GUC `role` okunur) ve kullanıcı yoksa, (3) **bakim_rolu** oturumu (sistem bağlamı) — ek olarak (4) **süper kullanıcı oturumu** (kurulum/sağlama/test tohumlaması). Kullanıcısız `klinik_uygulama` bağlantısı tenant GUC'uyla tenant KAZANAMAZ.
- Hasta tarafında `hasta_kullanici` tetikleyicisi, hastanın kliniğini çağıranın tenant'ında okur: **başka kliniğin hastasına portal hesabı açılamaz**.

**FORCE RLS özyinelemesi yok — kanıt**: `current_klinik_id()` yalnız RLS'siz eşleme tablosunu okur, `kullanici`/`hasta_kullanici` politikalarına hiç girmez. Kanıt olarak 0003'teki `sahip_kendi_satir` politikaları (eskiden rol çözümü için gerekliydi) **0007'de kaldırıldı** ve tüm izolasyon testleri (60) geçti; ayrıca `kullanici`, `hasta_kullanici`, `hasta`, `klinik`, `randevu` sorguları ve `EXPLAIN` derinlik hatası vermiyor (`tenant-turetme.test.ts`).

**Performans** (`scripts/dev/tenant-performans.mjs`, klinik başına 100 bin `hasta` satırı, 15 tekrarın ortancası, ms):

| Sorgu | Önce (GUC) | Sonra (türetme) |
|---|---|---|
| count(*) from hasta (tüm klinik satırları, RLS filtresi her satırda) | 16.01 | 16.16 |
| hasta + telefon filtresi (aralık taraması) | 19.45 | 19.23 |
| PK ile tek satır | 1.18 | 1.35 |
| randevu ⨝ hasta (iki RLS'li tablo) | 1.22 | 1.19 |

Değerlendirme: fark ölçüm gürültüsü sınırında (toplu sorgularda ~%1, tek satır PK aramasında ≈ +0,15 ms). Neden: politikalardaki `(SELECT current_klinik_id())` ifadeleri **InitPlan** olarak ifade başına BİR kez çalışıyor (EXPLAIN'de her InitPlan eşleme tablosuna ~2 buffer erişimi); satır başına çağrı yok. Bunu korumak için `klinik_sahip` politikaları da `(SELECT current_klinik_id())` biçiminde üretilir (aksi hâlde DEFINER fonksiyonlar tablo taramalarında satır başına arama yapardı). Ham veri ve planlar: `db/kontrol/tenant-performans.json`.

**Testler** (`tests/db/tenant-turetme.test.ts`, 13): yanlış tenant GUC'u yok sayılır (okuma/yazma); eşlemesiz kullanıcı ve kullanıcısız GUC tenant kazanamaz; hasta tenant'ı ve `aktif=false`; super_admin klinik seçer; klinik_anonim (kullanıcı varsa türetme kazanır); bakım bağlamı; süper kullanıcı oturumu; `kullanici.klinik_id`/`rol` güncelleme ve silme ile klinik silme (CASCADE) sonrası eşleme tutarlılığı; eşleme tablosuna doğrudan yazma denemeleri reddedilir; başka kliniğin hastasına portal hesabı reddedilir; özyineleme yok.

**Kalan**: kimliğe bürünme (geçerli bir `app.user_id` değerini uygulamanın koyması) hâlâ uygulamaya güvenir → Seçenek B (üretim öncesi karar). Dolu bir veritabanına 0007 uygulanırken eşleme doldurması tenant başına ya da süper kullanıcıyla yapılmalı (FORCE RLS); şu an canlı veri yok.

## Kararlar (2026-10-27) ve kalan açık konular
- **Onaylandı**: `klinik_yedek` BYPASSRLS istisnası (yalnız SELECT, pg_hba yalnız localhost, parola yalnız yedek hesabının okuyabildiği dosyada) — `docs/sunucu-kurulum.md`, `bypassrls-kontrol.sql` izin listesi.
- **Tasarlandı**: giriş öncesi logo route'u (§3b2).
- **Karar sende**: Better Auth'ta telefonla giriş (`docs/giris-akislari.md` seçenekleri A–D ve açık sorular).
- **Açık**: yedeğin Türkiye içi dış kopya hedefi (sağlayıcı/konum) ve özel anahtar saklama sorumluları; yurt dışı şifreli depolama hukuk onayı.
- **Açık (Aşama 3)**: DEFINER fonksiyonların anlamlı iş akışı testleri (modül taşımasında), `klinik_uygulama` yetkilerinin kodla birlikte doğrulanması (kodda kullanılmayan 17 tablo şimdilik yetkisiz — `db/arac/yetki-ozeti.json`).

## Kararlar (2026-10-28, Modül 4 sonrası)
- **A (iade sınırı):** kabul edildi; uygulama önce kullanıcı onayı (kaynak bağlantısı + istisna) — `docs/modul-4b-4c-tasarim.md` §4a.
- **B+D → Modül 4b**, **C → Modül 4c**: taşıma bittikten sonra, canlıdan önce; 4c, Aşama 7b'nin ilk hedefi. Tasarım: `docs/modul-4b-4c-tasarim.md`. Şimdi kodlanmaz.
- **E:** KDV yuvarlama kuralı belgelendi, mali müşavir teyidi üretim kapısında.
- **Sıfır kurulumda CHECK'ler** doğrudan geçerli (migration 0012; `NOT VALID` kalmadı, eski `NOT VALID` kısıtlar da 0012'de `VALIDATE` edilir).

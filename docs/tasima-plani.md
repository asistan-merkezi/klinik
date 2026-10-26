# Taşıma Planı: Vercel + Supabase → Windows Server VM + Postgres

Dal: `tasima/windows-postgres`. Kararlar: `CLAUDE.md > Hedef Altyapı ve Taşıma Kararları`.

> **Not — envanter kaynağı**: Bu plan `docs/supabase-envanter.md`'ye dayanacaktı, ama dosya repoda YOK (`git ls-files` ve çalışma dizini kontrol edildi). Aşağıdaki sayılar 2026-10-26'da kod/migration taramasından (`grep`) çıkarıldı; yaklaşıktır. Envanter dosyası eklenirse Aşama 0 çıktısı olarak onunla karşılaştırılıp bu plan düzeltilir.

## Mevcut bağımlılık özeti (tarama)

| Alan | Bulgu |
|---|---|
| Supabase import eden dosya | ~161 (`@supabase/*` veya `lib/supabase`) |
| `.from('...')` kullanan dosya | ~135 |
| Farklı `.rpc()` adı | ~50 (SQL tarafında çok daha fazla plpgsql fonksiyon) |
| Auth çağrısı (`auth.getUser/admin/signIn…`) | ~80 dosya |
| Realtime (`channel`/`postgres_changes`) | 3 dosya: `tablet-ekrani.tsx`, `canli-cizelge.tsx`, `randevu-bildirimleri.tsx` |
| Storage (`.storage`) | 6 dosya (şirket logosu, hasta belge/foto, personel belge, izin belgesi) + 4 migration'da `storage.objects` politikası |
| Migration | 172 dosya; ~157 yerde `auth.uid()`/`auth.users` referansı |
| Cron route | 5 (`personel-donem-otomatik-kapat`, `resmi-tatil-guncelle`, `audit-log-bolum-olustur`, `mesaj-kuyruk-isle`, `kredi-senkron`) |
| PDF | `lib/pdf/browser.ts` (`puppeteer-core` + `@sparticuz/chromium`) |
| Yurt dışı çıkış | `app/api/destek-chatbot/route.ts` → LLM (AI Gateway `anthropic/claude-sonnet-5`); mesaj merkezi (SMS/WhatsApp/Mail) ayrı proje |

## Ana riskler

1. **RLS'in `auth.uid()`'ye bağlı olması.** Politikaların, `current_klinik_id()`, `current_hasta_id()`, `is_super_admin()` ve trigger'ların çoğu `auth.uid()` / `request.jwt.claims` okuyor. Hepsi `current_setting('app.user_id')` / `app.tenant_id` modeline çevrilmeli; bir tanesi atlanırsa ya veri sızar ya da sessizce 0 satır döner.
2. **`SET LOCAL` + bağlantı havuzu.** `SET LOCAL` yalnız transaction içinde geçerli. Her sorgu `BEGIN; SET LOCAL …; … COMMIT` içinde çalışmazsa değerler başka isteğe sızar veya hiç görünmez. Tek bir sarmalayıcı (`withTenant`) dışında DB'ye erişim olmamalı.
3. **BYPASSRLS / sahiplik.** Tablo sahibi rol RLS'i atlar (FORCE yoksa). Uygulama rolü sahibi olmamalı, `BYPASSRLS` taşımamalı; `SECURITY DEFINER` fonksiyonların sahibi ayrı bir rol olmalı.
4. **PostgREST'e gömülü davranışlar kaybolur.** Embed (`select('a, b(c)')`), `max_rows` kesmesi, kolon GRANT'leri, `.insert().select()` RLS davranışı. 135 dosyada sorgu yeniden yazılacak; embed'ler JOIN/ayrı sorguya dönüşür.
5. **Auth kimlik göçü.** Supabase `auth.users` şifre hash'leri (bcrypt) Better Auth/argon2'ye doğrudan taşınmaz. Personel ve hasta portalı (sentetik e-posta `m-{id}@portal.local`) için ya bcrypt doğrulayıp ilk girişte argon2'ye yükseltme ya da toplu şifre sıfırlama gerekir. Tek oturum kilidi (`oturum_kilidi`) bu geçişte yeniden ele alınmalı.
6. **Realtime davranışı.** `postgres_changes` yerine SSE + LISTEN/NOTIFY: RLS'e tabi değil, yani NOTIFY yükünde veri taşınmamalı (yalnız `klinik_id` + id), istemci sonra yetkili sorguyla çeker. Bağlantı kopması/yeniden bağlanma tablet toleransı korunmalı.
7. **Windows'a özgü işletim riskleri.** NSSM servis çökme/yeniden başlatma, Caddy sertifika yenileme (80/443 dışarıdan erişilebilir olmalı), Windows güncelleme yeniden başlatmaları, Task Scheduler'ın saat dilimi, dosya yolu/büyük-küçük harf farkları, `puppeteer` için Chrome/Edge sürüm uyumu.
8. **KVKK.** Destek chatbotu hasta/kullanıcı verisini yurt dışı LLM'e gönderebilir; Supabase dışında e-posta servisi eklenirse aynı sorun. Yedekler şifresiz kalırsa ihlal. Erişim logu (kim hangi hasta verisine baktı) şimdiki `audit_log` ve `hasta_belge_goruntule` ile birlikte düşünülmeli.
9. **Tek VM = tek hata noktası.** Yedek/geri yükleme tatbikatı yapılmadan canlıya geçilmez.
10. **Canlı veri kesintisi.** Geçiş sırasında yazma durdurulmadan alınan dump tutarsız olur; kesinti penceresi ve geri dönüş planı (Aşama 9) şart.

## Aşamalar

Her aşama kendi içinde `npx tsc --noEmit` + `npm run lint` + `next build` temiz bitmeli (CLAUDE.md kuralı). Gizli değer hiçbir dosyaya yazılmaz.

### Aşama 0 — Envanter ve temel hazırlık
- `docs/supabase-envanter.md` üret/yerleştir: tablo, view, matview, fonksiyon (SECURITY DEFINER dahil), trigger, politika, extension, storage bucket, cron, env değişkeni listesi.
- Her Supabase API kullanımını sınıfla: sorgu / RPC / auth / storage / realtime.
- **Bitti kriteri**: envanter dosyası commit'li; her öğenin hedefteki karşılığı (Drizzle, SQL, Better Auth, dosya, SSE, vb.) bir tabloda yazılı; `grep @supabase` sonucu envanterdeki dosya listesiyle uyuşuyor.

### Aşama 1 — Hedef sunucu ve Postgres kurulumu
- Windows Server VM, Node.js LTS, PostgreSQL, NSSM, Caddy kurulumu; güvenlik duvarı yalnız 80/443; Postgres yalnız localhost.
- Roller: `klinik_sahip` (migration sahibi), `klinik_uygulama` (`NOBYPASSRLS`, tablo sahibi değil), `klinik_yedek`. `FORCE ROW LEVEL SECURITY` kararı.
- **Bitti kriteri**: boş bir Next.js sayfası Caddy + NSSM arkasında alan adıyla TLS üzerinden açılıyor; servis yeniden başlatmada ve VM reboot'ta kendiliğinden kalkıyor; `klinik_uygulama` rolüyle `BYPASSRLS` ve sahiplik olmadığı `\du` / `\dt` çıktısıyla gösterildi.

### Aşama 2 — Şema taşıma (Supabase'siz düz Postgres)
- 172 migration'dan Supabase'e özgü olanları ayıkla (`auth.*`, `storage.*`, `realtime`, `pg_net`, `pg_cron`, `supabase_*` roller/grantlar). Temiz bir `baseline` şema + gerekirse sonrası için Drizzle migration düzeni.
- `auth.uid()` → `current_setting('app.user_id', true)::uuid`; `current_klinik_id()` / `current_hasta_id()` / `is_super_admin()` bu ayarlardan türer. `auth.role()` kontrolleri yeniden tasarlanır.
- Politikalar ve `SECURITY DEFINER` fonksiyonlar (`SET search_path` dahil) yeni rollere göre yeniden grant'lenir; `audit_log` partition tuzağı (partition başına RLS + grant) korunur.
- **Bitti kriteri**: temiz bir Postgres'te baseline şema hatasız kurulur; RLS izolasyon testi (iki klinik, rol başına `SET LOCAL` simülasyonu, ROLLBACK) CLAUDE.md "Süreç" yöntemiyle geçer: başka klinik satırı görünmez/yazılamaz, `klinik_uygulama` ile `app.tenant_id` verilmezse 0 satır döner.

### Aşama 3 — Veri erişim katmanı (Drizzle + pg)
- `lib/db/`: havuz, `withTenant(tenantId, userId, fn)` (BEGIN + `SET LOCAL` + COMMIT), Drizzle şeması (introspect ile başla).
- `lib/supabase/*` yerine yeni istemci; sorgular modül modül taşınır (her PR bir modül: hasta, randevu, finans, personel, mesaj, vb.). PostgREST embed / `max_rows` / `parcalara()` / `tumSayfalariOku` tuzakları yerine açık JOIN ve sayfalama.
- 50 RPC çağrısı doğrudan `SELECT fn(...)`/`db.execute` olur; çok-tablolu işlemler RPC'de kalır (kural değişmez).
- **Bitti kriteri**: `grep -r "@supabase\|lib/supabase" app lib components` boş; DB'ye `withTenant` dışında erişim yok (lint kuralı veya test); mevcut vitest + entegrasyon betikleri yeni katmanda geçer; kritik akışlar (randevu → check-in → seans bedeli → ödeme, hasta CRUD, kasa/banka bakiyesi) eski ve yeni sistemde aynı rakamı verir.

### Aşama 4 — Auth (Better Auth)
- Better Auth credentials + argon2, oturumlar DB'de; rol/tenant her istekte DB'den. `proxy.ts` oturum yenilemesi yeniden yazılır; `eylemYetkisiGetir`, `sayfaYetkisiIste`, `gecerli-kullanici.ts`, `gecerli-hasta.ts` yeni oturuma bağlanır.
- Personel, hasta portalı, QR puantaj girişi (`/giris?donus=`), geçici portal şifresi, işten çıkışta hesabı kapatma (Supabase ban yerine oturum iptali + giriş engeli), giriş hız sınırı, tek oturum kilidi kararı.
- Mevcut kullanıcı göçü stratejisi (bcrypt doğrulama + argon2 yükseltme **ya da** toplu sıfırlama) kullanıcıyla netleştirilir.
- **Bitti kriteri**: 5 rolün (super_admin, klinik_admin, resepsiyon, terapist, muhasebe) ve portal hastasının giriş/çıkışı gerçek tarayıcıda denendi; yetkisiz rol sayfa ve action'da reddediliyor; işten çıkarılan kullanıcı yeni oturum açamıyor ve açık oturumu düşüyor; anon QR akışları (ön kayıt, anket) kimliksiz çalışıyor ve anon rolüne SELECT hâlâ kapalı.

### Aşama 5 — Dosyalar (Storage yerine dosya sistemi)
- Web kökü dışında klasör (`DOSYA_KOKU` env); yol düzeni mevcut ile aynı (`{klinik_id}/{hasta_id}/{kategori}/{belge_id}.{ext}`). Yalnız yetkili route servis eder (RLS'li sorguyla belge kaydı doğrulanır, `hasta_belge_goruntule` kaydı korunur). Yol gezinme (`..`) ve MIME doğrulaması.
- 6 yükleme noktası + logo servisi taşınır; mevcut dosyalar Supabase'ten indirilip aynı yapıya kopyalanır.
- **Bitti kriteri**: başka kliniğin / yetkisiz rolün belge URL'si 403/404; terapist yükler+görür+silemez kuralı korunmuş; yol gezinme denemesi reddediliyor; taşınan dosya sayısı ve toplam boyut kaynakla birebir (sayım + hash örneklemi).

### Aşama 6 — Realtime (SSE + LISTEN/NOTIFY)
- `randevu` (ve tablet için gerekenler) üzerinde NOTIFY tetikleyicisi (yük: yalnız `klinik_id`, tablo, id, durum); tek bir sunucu dinleyicisi + klinik bazlı SSE endpoint'i, her olayda istemci yetkili sorguyla veriyi çeker.
- 3 tüketici (`tablet-ekrani`, `canli-cizelge`, `randevu-bildirimleri`) taşınır; çevrimdışı rozeti, yeniden bağlanınca tazeleme ve 5 dk güvenlik yenilemesi korunur. Caddy'de SSE için buffering kapalı, boşta bağlantı zaman aşımı yok.
- **Bitti kriteri**: iki tarayıcıyla check-in tablete ve çizelgeye ≤ birkaç sn'de yansıyor; başka kliniğin olayı gelmiyor; sunucu yeniden başlatılınca istemci kendiliğinden bağlanıp tazeleniyor; 30+ dk açık tablette bağlantı kopmuyor.

### Aşama 7 — Cron, PDF, mesajlaşma, dış çağrılar
- Task Scheduler: 5 `/api/cron/*` route'u gizli başlıkla (`CRON_SECRET`), `lib/cron-yetki.ts` korunur; saatler UTC mi İstanbul mu net yazılır (mevcut: UTC). `mesaj-kuyruk-isle` 5 dk'da bir, `audit-log-bolum-olustur` pencere kontrolü.
- PDF: `@sparticuz/chromium` kaldırılır, `puppeteer-core` + `CHROMIUM_PATH`; `vercel.json` / `outputFileTracingIncludes` kalıntıları temizlenir.
- KVKK: destek chatbotuna giden içerik maskelenir ya da LLM bağlantısı kapatılır (karar gerekir); mesaj merkezi çağrılarında hangi kişisel verinin çıktığı listelenir; e-posta için yurt dışı servis kullanılmayacaksa alternatif (kendi SMTP) kararı.
- **Bitti kriteri**: her cron elle ve zamanlanmış çalıştırıldı, yetkisiz çağrı (başlıksız) 401; 2 PDF formu hedef sunucuda üretildi ve gözle doğrulandı; chatbot/e-posta/mesaj giden isteklerinde ham kişisel veri bulunmadığı örnek istek kaydıyla gösterildi.

### Aşama 8 — Güvenlik, KVKK, yedek, izleme
- Yedek: günlük `pg_dump` + WAL (mümkünse), **şifreli** (örn. `age`/7-Zip AES), sunucu dışı konuma; saklama süresi hukukla netleşir. Geri yükleme tatbikatı.
- Erişim logu: hasta verisi okuma izleri (`hasta_belge_goruntule` genişletmesi veya uygulama logu); log dosyalarında kişisel veri yok; log döndürme.
- Sertleştirme: RDP/yönetim erişimi yalnız dışarı-bağlantılı (pull) modelle uyumlu şekilde, gelen yönetim portu açık değil; Windows Defender/güvenlik duvarı; ortam değişkenleri yalnız servis hesabına okunur; Cloudflare proxy + origin'e yalnız Cloudflare IP'leri.
- Servis izleme: NSSM çıktı/log, disk/Postgres doluluk uyarısı, uptime kontrolü.
- **Bitti kriteri**: şifreli yedekten boş sunucuya geri yükleme yapıldı ve rakamlar (kasa/banka bakiyesi, hasta sayısı) kaynakla tutuyor; yedek dosyası anahtarsız açılamıyor; dışarıdan yalnız 80/443 açık (port taraması); gizli değer repo ve loglarda yok (`grep` + gizli tarayıcı).

### Aşama 9 — Deploy hattı (pull tabanlı)
- Sunucuda Task Scheduler/servis: Git'ten belirli etiket/dal çeker (salt-okunur deploy anahtarı veya token — dosyada yok), `npm ci` + `next build`, NSSM servisini yeniden başlatır; başarısızsa önceki sürüme döner. Migration adımı ayrı ve onaylı.
- **Bitti kriteri**: etiket atılınca sunucu kendisi çekip yayınlıyor; bilerek bozuk bir sürümde otomatik geri dönüş çalıştı; sunucuya gelen yönetim bağlantısı olmadan tüm akış tamamlandı.

### Aşama 10 — Veri göçü ve geçiş
- Kesinti penceresi: Supabase'te yazma kapat → dump → Postgres'e yükle → doğrulama sayıları (tablo bazında satır sayısı, finans toplamları, bakiye view'ları, dosya sayısı) → DNS geçişi (Cloudflare) → kısa süre eski sistem salt-okunur açık.
- Önce prova geçişi (staging veri kopyasıyla), sonra gerçek geçiş. Geri dönüş: DNS'i eski Vercel'e geri çevirme + o sırada yazılanları elle aktarma planı.
- **Bitti kriteri**: provada tüm doğrulama sayıları eşit; gerçek geçişte kullanıcı kabul testi (resepsiyon, terapist, tablet, portal) geçti; 1-2 hafta sorunsuz çalışma sonrası Supabase/Vercel projeleri kapatılır ve dal `main`'e birleştirilir (birleştirme kullanıcı onayıyla).

## Açık kararlar (kullanıcıdan gerekli)
- Mevcut kullanıcı parolaları: bcrypt doğrulama + argon2 yükseltme mi, toplu sıfırlama mı?
- Destek chatbotu: LLM'e giden veri maskelenecek mi, yoksa özellik kapatılacak mı? E-posta gönderimi nasıl (kendi SMTP?)?
- Tek oturum kilidi taşınacak mı (henüz canlıda aktif değil)?
- Yedek saklama süresi ve şifreleme anahtarının tutulduğu yer (hukuk onayı).
- `FORCE ROW LEVEL SECURITY` kullanılsın mı (öneri: evet).

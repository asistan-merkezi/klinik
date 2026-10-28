# Sunucu Kurulumu (Windows Server VM)

Durum: tasarım + **dağıtım betikleri yazıldı (`deploy/windows/`), Windows Server'da HİÇ ÇALIŞTIRILMADI** (sunucu yok; PowerShell sözdizimi ayrıştırıldı, `next build` standalone çıktısı ve `/api/saglik` yerelde denendi). §8–§11 adımları ilk kurulumda sırayla denenip düzeltilecek. **Gizli değer yazılmaz**, yalnız değişken adları.

## 1. Bileşenler
Node.js LTS · PostgreSQL (aynı VM, yalnız `localhost`) · NSSM (uygulama servisi) · Caddy (TLS, alan adı) · sistem Chrome/Edge (`CHROMIUM_PATH`) · Git (pull deploy) · `age` (yedek şifreleme, yalnız ortak anahtar tarafı).

## 2. Veritabanı rolleri

| Rol | Giriş | RLS | Yetki | Kullanan |
|---|---|---|---|---|
| `klinik_sahip` | hayır (`NOLOGIN`) | tabi (FORCE) | Tablo/fonksiyon sahibi; DDL | Migration bu rolle sahiplik atar (`scripts/db-kur.ps1`) |
| `klinik_uygulama` | evet | **tabi** | Yalnız gerekli `SELECT/INSERT/UPDATE/DELETE` ve `EXECUTE` | Uygulama (yalnız `DATABASE_URL`) |
| `klinik_anonim` | hayır (uygulama giriş öncesi akışlarda `SET LOCAL ROLE`) | **tabi** | Yalnız anonim akışların dar politikaları/fonksiyonları | QR, portal/personel giriş öncesi, iş başvurusu |
| **`bakim_rolu`** | evet | **tabi (BYPASSRLS DEĞİL)** | `klinik` üzerinde **yalnız SELECT**; bakım fonksiyonlarına EXECUTE; `klinik_uygulama` rolüne üyelik (`SET LOCAL ROLE klinik_uygulama` ile klinik başına iş `withTenant` altında yapılır) | **Yalnız** `scripts/` altındaki bakım betikleri (`BAKIM_DATABASE_URL`). Uygulama süreci bu bilgiyi hiç almaz |
| `kimlik_rolu` | evet | tabi | **Yalnız** `kimlik_kullanici`, `kimlik_hesap`, `oturum`, `kimlik_dogrulama` (Better Auth bağlantısı). Başka hiçbir tabloda/fonksiyonda yetkisi yok; `klinik_uygulama`, `klinik_anonim`, `bakim_rolu` bu tablolarda HİÇBİR yetkiye sahip değil | Better Auth (`KIMLIK_DATABASE_URL`) |
| `klinik_tanima` | hayır (`NOLOGIN`) | tabi | Yalnız `klinik(id, ad, qr_kisa_kod)` ve `randevu(id, klinik_id)` kolonlarını okuyabilir; `tanima` şemasındaki iki DEFINER fonksiyonun sahibi | Giriş öncesi tenant'sız çözümleme (kısa kod → klinik, randevu → klinik) |
| `klinik_yedek` | evet | **BYPASSRLS** (tek istisna, **ONAYLANDI 2026-10-27**) | **Yalnız SELECT** (`pg_read_all_data`; başka rol üyeliği, yazma, CREATE yok). `pg_hba.conf`'ta yalnız `127.0.0.1/32` ve `::1/128` | Yalnız `yedek.ps1` (parolası yalnız `svc-klinik-yedek` hesabının okuyabildiği `yedek.env`'de) |

**klinik_yedek istisnası (onaylandı):** FORCE RLS altında `pg_dump` BYPASSRLS'siz tabloyu tam okuyamaz; süper kullanıcı yerine yalnız-okuma yetkili dar bir rol seçildi. Koşullar: (1) yalnız SELECT, yazma/DDL yetkisi yok, hiçbir nesnenin sahibi değil; (2) giriş yalnız localhost'tan (aşağıdaki `pg_hba.conf` satırları); (3) parola yalnız yedek hesabının okuyabildiği `yedek.env` dosyasında; (4) `db/kontrol/bypassrls-kontrol.sql` izin listesinde adıyla yer alır (başka hiçbir rol BYPASSRLS olamaz) ve `yetki-matrisi.sql` yazma yetkisini ve rol üyeliklerini denetler; (5) pg_dump kimlik tablolarını da (parola hash'leri dahil) okur — bu yüzden yedek şifreli saklanır ve `klinik_yedek` kimlik tablolarında yetki matrisinin tek izinli istisnasıdır (yalnız SELECT).

`pg_hba.conf` (özet; sıra önemli, `scram-sha-256`):
```
host  klinik  klinik_yedek     127.0.0.1/32  scram-sha-256
host  klinik  klinik_yedek     ::1/128       scram-sha-256
host  klinik  klinik_uygulama  127.0.0.1/32  scram-sha-256
host  klinik  kimlik_rolu      127.0.0.1/32  scram-sha-256
host  klinik  bakim_rolu       127.0.0.1/32  scram-sha-256
host  all     all              0.0.0.0/0     reject
host  all     all              ::/0          reject
```
(`listen_addresses = 'localhost'` ayrıca.) Kontrol: `bypassrls-kontrol.sql` `pg_hba_file_rules` üzerinden `klinik_yedek` için uzak adres bulursa HATA verir.

Karar: bakim_rolu BYPASSRLS DEĞİL; bakım işi de RLS'ten geçer (klinik başına `app.tenant_id`). Böylece "sistem işi" bile başka kliniğin verisini bir transaction'da karıştıramaz. Sistem bağlamı RPC'lerde `session_user = 'bakim_rolu'` ile tanınır (bkz. `docs/service-role-siniflama.md`).

**Tüm tenant tablolarında `ALTER TABLE … FORCE ROW LEVEL SECURITY`.** Hiçbir fonksiyonun sahibi RLS'i atlayan bir rol olmaz; fonksiyonlar `klinik_sahip` sahipliğindedir. Doğrulama: `db/kontrol/bypassrls-kontrol.sql` (`scripts/db-kur.ps1` içinde çalışır). Tenant olmayan tablolar `docs/sema-esleme.md`'de listelenir.

## 3. Ortam değişkenleri ve gizli dosyalar (yalnız adlar)

`CRON_SECRET` **yoktur** (HTTP cron kalktı). Windows hesapları ve dosyalar:

| Windows hesabı | Ne çalıştırır | Okuyabildiği gizli dosya |
|---|---|---|
| `svc-klinik-uygulama` | NSSM servisi (Next.js) | `C:\klinik\gizli\uygulama.env` |
| `svc-klinik-bakim` | Task Scheduler görevleri (`scripts/*.mjs`) | `C:\klinik\gizli\bakim.env` |
| `svc-klinik-yedek` | `yedek.ps1` | `C:\klinik\gizli\yedek.env` |

**`uygulama.env`**: `DATABASE_URL` (klinik_uygulama) · `KIMLIK_DATABASE_URL` (kimlik_rolu — Better Auth; uygulama süreci iki bağlantı havuzu kullanır) · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL` · `DOSYA_KOKU` · `CHROMIUM_PATH` · `MESAJ_MERKEZ_BASE_URL` · `MESAJ_MERKEZ_API_KEY` · `DESTEK_CHATBOT_ACIK` (varsayılan kapalı) · `GIZLI_VERI_ANAHTARI` (32 bayt, base64; veritabanında saklanan dış servis gizlilerini — Paraşüt client secret — şifreler; **yedekten AYRI saklanmalı**: yedek + anahtar birlikte ele geçirilirse gizliler çözülür; anahtar kaybolursa kayıtlı gizliler yeniden girilmelidir).
**`bakim.env`**: `BAKIM_DATABASE_URL` (bakim_rolu) · `MESAJ_MERKEZ_BASE_URL` · `MESAJ_MERKEZ_API_KEY` (kuyruk işçisi ve kredi senkronu için). **`DATABASE_URL` ve `BETTER_AUTH_SECRET` burada YOKTUR.**
**`yedek.env`**: `YEDEK_DATABASE_URL` (klinik_yedek; yalnız localhost) · `YEDEK_HEDEF_KLASOR` · `YEDEK_ALICI_ANAHTARI` (age ortak anahtarı) · `YEDEK_GUNLUK_SAKLAMA_GUN` (30) · `YEDEK_AYLIK_SAKLAMA_AY` (12) · `YEDEK_DIS_KOPYA_HEDEFI`.

### NTFS izinleri (tasarım — Aşama 1'de uygulanıp doğrulanacak)
Miras kapatılır, yalnız ilgili hesap OKUR, çapraz hesaplara açık **Deny** yazılır:
```
icacls C:\klinik\gizli /inheritance:r
icacls C:\klinik\gizli /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F"
icacls C:\klinik\gizli\bakim.env    /grant:r "KLINIK\svc-klinik-bakim:R"
icacls C:\klinik\gizli\bakim.env    /deny    "KLINIK\svc-klinik-uygulama:(R,RX)"
icacls C:\klinik\gizli\uygulama.env /grant:r "KLINIK\svc-klinik-uygulama:R"
icacls C:\klinik\gizli\uygulama.env /deny    "KLINIK\svc-klinik-bakim:(R,RX)"
icacls C:\klinik\gizli\yedek.env    /grant:r "KLINIK\svc-klinik-yedek:R"
```
**Doğrulama (bitti kriteri)**: `svc-klinik-uygulama` hesabıyla (`runas`) `type C:\klinik\gizli\bakim.env` → "Erişim engellendi"; uygulama sürecinin ortamında `BAKIM_DATABASE_URL` görünmüyor. Yönetici hesabı dosyaları okuyabilir (sunucu yöneticisine güven varsayılır; Administrators grubunun üyeleri ayrıca belgelenir).
Betikler `node --env-file=C:\klinik\gizli\bakim.env scripts\<is>.mjs` ile başlar ve env değerlerini loga yazmaz. Aynı Windows hesabının süreçleri birbirinin ortamını okuyabildiğinden ayrım **hesap** düzeyindedir (bu yüzden üç ayrı hesap).

## 3b. Zamanlanmış işler (Task Scheduler)

Sunucu saat dilimi **Turkey Standard Time** (UTC+3, yaz saati yok); görev saatleri doğrudan İstanbul saatidir. Görevler `svc-klinik-bakim` ile "oturum açılsa da açılmasa da" çalışır; hata olay günlüğüne veri içermeyen satır olarak yazılır.

| Betik (`scripts/`) | Sıklık | Eski cron (UTC) → İstanbul | Not |
|---|---|---|---|
| `personel-donem-otomatik-kapat.mjs` | Ayın 1'i 06:00 | `0 3 1 * *` → 06:00 | Son 3 ay, idempotent, 8'li eşzamanlı |
| `audit-log-bolum-olustur.mjs` | Ayın 1'i 05:00 | `0 2 1 * *` → 05:00 | Pencereyi 3 ay ileri taşır |
| `resmi-tatil-guncelle.mjs` | Ayın 1'i 07:00 | `0 4 1 * *` → 07:00 | Global `resmi_tatil` + klinik önerileri |
| `mesaj-kuyruk-isle.mjs` | 5 dk'da bir | (merkez zamanlayıcı) | Kuyruk + randevu hatırlatma taraması |
| `kredi-senkron.mjs` | Saatlik | (merkez zamanlayıcı) | Merkez bakiyesi → yerel yansıma |

Betikler bakim_rolu ile bağlanıp `klinik` listesini okur; her klinik için `BEGIN; SET LOCAL ROLE klinik_uygulama; SET LOCAL app.tenant_id …` (`withTenant`) ile işler. Çift çalışma: Task Scheduler "çalışan örnek varken yenisini başlatma" + işin kendi idempotency'si.

## 3b2. Giriş öncesi logo (tasarım)
Giriş sayfaları logoyu **tek amaçlı, önbellekli, tenant verisi dönmeyen** bir route'tan alır: `GET /api/logo/[kisaKod]` (kısa kod = herkese açık QR kısa kodu). Kurallar: yalnız görsel baytı döner (JSON/başka klinik alanı yok); kısa kod `tanima.klinik_qr_bilgisi_getir` ile çözülür, bulunamazsa sabit varsayılan logo (404 ayrımı sızdırmaz); `Cache-Control: public, max-age=3600`, ETag; hız sınırı (anonim uç, bkz. plan Aşama 3); dosya `DOSYA_KOKU/klinik-logo/{klinik_id}/…` altından yalnız bu route okur, doğrudan dosya servisi yoktur. Oturumlu panelde logo `/api/dosya/logo` (yetkili route) ile gelir. Caddy'de bu yol için kısa önbellek eklenebilir; **diğer hiçbir dosya yolu önbelleğe alınmaz.**

## 3b3. Canlı olay akışı (SSE) ve Caddy

Randevu çizelgesi, oda tableti ve randevu bildirimleri canlı güncellemeyi `GET /api/canli?t=randevu` (Server-Sent Events) ile alır; Supabase Realtime kullanılmaz. Mimari: tablolardaki `trg_canli_olay` tetikleyicisi `pg_notify('canli', {t,i,k})` yollar (yük YALNIZ tablo adı + satır id + klinik id; veri yok) → süreç başına TEK `LISTEN` bağlantısı (`lib/realtime/dinleyici.ts`, havuz dışı, kopunca üstel geri çekilmeyle yeniden bağlanır) → bellek içi klinik bazlı dağıtım → SSE. İstemci olayı alınca veriyi normal yetkili yoldan (oturum + RLS) yeniden çeker.

**Caddy ayarı ZORUNLU**: `/api/canli` yolunda `reverse_proxy` içinde `flush_interval -1` (arabellek kapalı) ve bu yolda `encode` yok; aksi hâlde Caddy olayları biriktirir. Hazır dosya: `deploy/windows/Caddyfile`. Zaman aşımı notu: akış gövdesine süre sınırı KONMAZ (`response_header_timeout` yalnız başlık içindir); sunucu bağlantıyı en fazla 10 dk sonra kendisi kapatır (`SSE_OMUR_MS`) — bu hem oturum iptali/gece zorunlu çıkışının/devre dışı bırakmanın en geç 10 dk içinde akışı kesmesini sağlar hem de vekil/ağ cihazlarındaki boşta kalma zaman aşımlarına karşı yeniden bağlanmayı doğal hâle getirir. Sunucu 25 sn'de bir `ping` yollar; istemci 70 sn sessizlikte bağlantıyı yeniler. Cloudflare proxy kapalı olduğundan (bkz. 3c) Cloudflare'in 100 sn akış sınırı geçerli değildir; proxy ileride açılırsa SSE yolu için ayrıca ele alınmalıdır.

Sınırlar: kullanıcı başına en fazla 5 eşzamanlı akış (aşımda 429); yavaş istemcide 64 mesajdan fazla birikirse bağlantı kapatılır (istemci yeniden bağlanıp telafi çeker). Yalnız personel oturumu (portal hastası ve klinik bağlamı olmayan super_admin alamaz). Tek uygulama süreci varsayımı: birden fazla süreç çalıştırılırsa her süreç kendi LISTEN bağlantısını açar ve her biri kendi abonelerine dağıtır (NOTIFY tüm dinleyicilere gittiğinden ek iş gerekmez).

## 3c. Cloudflare — KVKK notu

Klinik alan adı için Cloudflare **proxy KAPALI (yalnız DNS, "gri bulut")**. Gerekçe: proxy açıkken TLS Cloudflare'de sonlanır ve sağlık verisi yurt dışındaki bir sistemde çözülmüş (düz metin) olarak geçer; KVKK açısından yurt dışı aktarım sayılabilir. Sonuçlar: TLS doğrudan Caddy'de sonlanır; Cloudflare'in DDoS/WAF koruması yoktur (güvenlik duvarı, Caddy hız sınırı ve Windows sertleştirmesi ile karşılanır); origin IP herkese açıktır; "origin'e yalnız Cloudflare IP'leri" kısıtı **uygulanmaz**.

## 4. Yedek tasarımı (`yedek.ps1`)

Hukuk onayına tabi, **değiştirilebilir parametreler**: günlük yedek **30 gün**, aylık yedek **12 ay** (`YEDEK_GUNLUK_SAKLAMA_GUN`, `YEDEK_AYLIK_SAKLAMA_AY`).

**Şifreleme anahtarı sunucuda saklanmaz.** Tasarım: asimetrik şifreleme (`age`). Sunucuda yalnız **ortak (public) anahtar** bulunur (`YEDEK_ALICI_ANAHTARI`, gizli değil) — bununla yedek şifrelenebilir ama çözülemez. **Özel anahtar** sunucuya hiç girmez; yedeği yöneten kişinin elinde, kasada/parola yöneticisinde tutulur (en az 2 kopya, farklı kişi/konum). Alternatif (parola tabanlı AES, 7-Zip) parolanın çalışma anında sunucuda bulunmasını gerektirdiği için tercih edilmez.

Betik akışı:
1. `klinik_yedek` rolüyle `pg_dump -Fc` (özel biçim) → geçici dosya (şifresiz hâli diske kalıcı yazılmaz; mümkünse boru hattıyla doğrudan `age`'e).
2. `age -r $env:YEDEK_ALICI_ANAHTARI` ile şifrele → `{tarih}-gunluk.dump.age`.
3. Ayın ilk yedeği ayrıca `{yyyy-MM}-aylik.dump.age` olarak işaretlenir.
4. SHA-256 özeti (`.sha256`) yazılır; dosya boyutu 0 ise hata.
5. Dosya sistemi (`DOSYA_KOKU`) için ayrı arşiv (zip → age).
6. Saklama: günlükler `YEDEK_GUNLUK_SAKLAMA_GUN` günden eskiyse, aylıklar `YEDEK_AYLIK_SAKLAMA_AY` aydan eskiyse silinir (aylıklar günlük temizliğinden korunur).
7. Sunucu **dışına** kopya: sunucudan dışarı bağlanarak (push) `YEDEK_DIS_KOPYA_HEDEFI`'ne. **Önce Türkiye içi bir hedef**; hedef seçimi **açık karar** (plan). Yurt dışı şifreli depolama hukuk onayına bağlıdır, onaysız kullanılmaz.
8. Başarısızlık Windows olay günlüğüne ve (veri içermeyen) uyarıya yazılır; betik çıktısında kişisel veri/anahtar yok.

Task Scheduler: günlük, gece saati; `SYSTEM` yerine yalnız gerekli klasörlere yetkili servis hesabı.

## 5. Geri yükleme testi (kurulumun ZORUNLU adımı)

Yedek, geri yüklenip doğrulanmadıkça yedek sayılmaz. Kurulumda ve sonra **her ay** (ayrıca aylık yedeklerden biri çeyrek başına):
1. Özel anahtarı **geçici** olarak ayrı bir test makinesine/VM'e getir (üretim sunucusuna değil).
2. `age -d -i <özel anahtar>` ile çöz; `.sha256` doğrula.
3. Boş bir Postgres'e `pg_restore` (rolleri/`FORCE RLS` ayarlarını içerecek şekilde).
4. Doğrulama: tablo bazında satır sayıları kaynakla aynı; finans kontrolleri (Kasa/Banka bakiyesi, `v_hasta_cari_ozet` toplamı); en az bir hasta belgesi dosya arşivinden açılıyor; uygulama test bağlantısıyla açılıp bir klinik admin girişi yapılabiliyor (RLS çalışıyor: tenant bağlamı olmadan 0 satır).
5. Test kopyasını ve özel anahtarı makineden **güvenli sil**; sonuç (tarih, yedek adı, geçti/kaldı) kayda geçir.
6. **Bitti kriteri**: yukarıdaki 4. maddenin tamamı geçti ve kayıt tutuldu; aynı süre sonunda anahtar yokken sunucudaki dosyanın açılamadığı denendi.

## 6. Sıra
§8–§11 dağıtım betiklerini içerir. Denenmemiş komut "denendi" diye işaretlenmez: ilk sunucu kurulumunda her adımın yanına tarih/sonuç yazılır.

## 7. GIZLI_VERI_ANAHTARI — saklama ve rotasyon

Veritabanında saklanan dış servis gizlilerini (şu an Paraşüt `client_secret`) şifreleyen 32 baytlık AES-256-GCM anahtarıdır (`lib/guvenlik/gizli-sifrele.ts`). Değeri hiçbir dosyaya/koda yazılmaz; yalnız `uygulama.env`'de tutulur.

**Kural: anahtar, veritabanı yedeğiyle AYNI yerde saklanmaz.** Yedek (`yedek.ps1` çıktısı, dış kopya dahil) ve bu anahtar ayrı ortamlarda/ayrı erişim yetkisiyle tutulur; ikisi birlikte ele geçirilirse gizliler çözülür. Anahtarın yedeği ayrıca (yedek kasasından farklı bir yerde, en az iki yetkili kişide) saklanır; **anahtar kaybolursa** şifreli gizliler çözülemez ve Ayarlar > Muhasebe Sync'ten yeniden girilir (veri kaybı değil, yeniden giriş).

**Üretim:** `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (çıktı terminalde kalır; geçmişe/loga/sohbete yapıştırılmaz) → doğrudan `uygulama.env`'e.

**Rotasyon (yılda en az bir kez; ayrıca anahtardan şüphelenilince veya anahtara erişimi olan kişi ayrılınca):**
1. Yeni anahtarı üret; eski anahtarı geçiş süresince `GIZLI_VERI_ANAHTARI_ESKI` olarak yanına koy. *Uygulama notu:* iki anahtarlı çözme (`enc:v1` eski / `enc:v2` yeni) rotasyon betiğiyle birlikte eklenecek; o zamana kadar rotasyon adım 2b ile (yeniden girme) yapılır.
2. (a) Betik: her klinik için `withTenant` ile satırı eski anahtarla çöz → yeni anahtarla şifrele → yaz; (b) betik yokken: yeni anahtarı devreye al, her klinik yöneticisi Muhasebe Sync'te secret'ı yeniden girer (yeni anahtarla şifrelenir).
3. Tüm kliniklerin yeniden şifrelendiği doğrulanınca eski anahtarı ortamdan sil; eski anahtarın tüm kopyalarını (kasa dahil) imha et, tarihçeye yalnız sürüm/tarih notu düş (anahtarın kendisi değil).
4. Yeni anahtarın yedeğini (yukarıdaki kural) al; uygulama servisini yeniden başlat.
5. İhlal şüphesinde: anahtarı hemen döndür **ve** Paraşüt tarafında client secret'ı yenile (şifreleme eski secret'ı korumaz).

## 8. Dağıtım dosyaları ve klasör düzeni (`deploy/windows/`)

| Dosya | Görev |
|---|---|
| `kurulum.ps1` | Saat dilimi, araç denetimi (Node ≥22, Git, PostgreSQL araçları, Caddy, NSSM, age, Chrome/Edge), klasörler + NTFS izinleri, 3 servis hesabı, güvenlik duvarı (yalnız 80/443), olay günlüğü kaynakları. İdempotent. `-Indir` varsa winget ile eksikleri kurar. |
| `servis-kur.ps1` | `klinik-uygulama` (düşük yetkili `svc-klinik-uygulama`, otomatik başlar, çökünce 5 sn sonra yeniden başlar, log 10 MB/günlük döner) ve `klinik-caddy` NSSM servisleri. |
| `Caddyfile` | Alan adı → `localhost:3000`, otomatik HTTPS, güvenlik başlıkları, proxy zaman aşımı 90–120 sn, SSE (`/api/canli`) arabelleksiz, erişim logu döner. Cloudflare IP kısıtı **pasif not** (§3c: proxy kapalı). |
| `guncelle.ps1` | Pull tabanlı deploy + otomatik geri dönüş (§10). Task Scheduler ile (`-GorevKaydet`). |
| `migrasyon-uygula.ps1` | `db/migrations` için kayıtlı, dosya başına atomik migration uygulayıcı (`migrasyon.kayit`). |
| `yedek.ps1` | Günlük şifreli yedek + saklama + ayrı diske kopya (§4 tasarımı; §11 geri yükleme). |
| `ortak.ps1` | Betiklerin ortak yardımcıları. |
| `env.production.ornek` | Yalnız değişken adları (3 ayrı gizli dosya bölümü). Eski Vercel adları (`AUTH_SECRET`→`BETTER_AUTH_SECRET`, `STORAGE_DIR`→`DOSYA_KOKU`) karşılıklarıyla notlu; `CRON_SECRET` yoktur. |

Betikler UTF-8 **BOM'lu** kaydedilir (Windows PowerShell 5.1 BOM'suz dosyayı ANSI okuyup Türkçe/uzun tire karakterlerinde sözdizimi hatası verir); düzenlerken BOM'u koruyun.

Klasörler (`C:\klinik`): `kaynak` (git deposu, yalnız derleme) · `surumler\<tarih>-<sha>` (çalışan paketler, uygulama hesabına salt-okunur) · `guncel` (junction → çalışan sürüm) · `gizli` · `log` · `dosya` (`DOSYA_KOKU`) · `yedek` · `caddy-veri`. Bakım betikleri (`scripts\*.mjs`) `kaynak` içinden çalışır (`svc-klinik-bakim` okur); `guncelle.ps1` `npm ci` sırasında `node_modules`'ü kısa süre yeniler — o dakikalarda başlayan bir bakım görevi hata verebilir, sonraki çalışmada telafi olur.

`CHROMIUM_PATH` ortam değişkeni `lib/pdf/browser.ts` tarafından okunur (eski `PUPPETEER_EXECUTABLE_PATH` yedek olarak durur). `next.config.ts` `output: "standalone"`; `next build` sonrası `.next/standalone/server.js` çıkar, `guncelle.ps1` `.next/static` ve `public` klasörlerini sürüm klasörüne kopyalar. Build sunucuda, yönetici hakkı olan hesapla çalışır (Windows'ta standalone izleme dosya bağlantısı oluşturabilir; yetkisiz hesapta `EPERM` verebilir).

## 9. Adım adım ilk kurulum

Yönetici PowerShell (5.1 ya da 7). Her adımdan sonra çıktıyı kontrol edin.

1. **Hazırlık:** `git clone <depo> C:\klinik\kaynak` (deploy için salt-okunur anahtar/jeton) → `cd C:\klinik\kaynak\deploy\windows` → `.\kurulum.ps1 -Indir`. Eksik araç listesi çıkarsa elle kurup tekrar çalıştırın. Çıktıdaki Chrome/Edge yolunu not edin.
2. **Veritabanı:** PostgreSQL kurulu, `pg_hba.conf`/`listen_addresses` §2'deki gibi. `KLINIK_UYGULAMA_SIFRE`, `KLINIK_KIMLIK_SIFRE`, `KLINIK_BAKIM_SIFRE`, `KLINIK_YEDEK_SIFRE` ortam değişkenlerini oturumluk verip `C:\klinik\kaynak\scripts\db-kur.ps1` çalıştırın. Hemen ardından **bir kez** `.\migrasyon-uygula.ps1 -KaydaIsle` (kurulan migration'ları "uygulandı" olarak kaydeder; sonrası `guncelle.ps1` yönetir).
3. **Gizli dosyalar:** `env.production.ornek` bölümlerini `C:\klinik\gizli\uygulama.env`, `bakim.env`, `yedek.env` olarak (değerleri doldurarak) oluşturun; `kurulum.ps1`'i **tekrar çalıştırın** (env dosya izinleri + çapraz Deny uygulanır). §3 doğrulamasını yapın (`runas` ile uygulama hesabı `bakim.env`'i okuyamamalı).
4. **İlk sürüm:** `.\guncelle.ps1 -IlkKurulum` (derler, `surumler\...` oluşturur, `guncel` bağlantısını kurar; servis henüz yok).
5. **Servisler:** `.\servis-kur.ps1 -AlanAdi klinik.firma.com.tr` (uygulama hesabının parolasını sorar). DNS A kaydı sunucunun genel IP'sine (Cloudflare **gri bulut**) işaret etmeli ve 80/443 dışarıdan erişilebilir olmalı; Caddy sertifikayı kendisi alır.
6. **Zamanlanmış işler:** §3b tablosundaki bakım görevleri (`svc-klinik-bakim`), `yedek.ps1` (`svc-klinik-yedek`, günlük gece), `guncelle.ps1` (`.\guncelle.ps1 -GorevKaydet -GorevSaati 04:00 -GorevHesabi <yönetici hesap>`). Hepsinde "çalışan örnek varken yenisini başlatma".
7. **Sağlık + duman testi:** §9a; tarayıcıdan giriş, bir PDF, bir canlı çizelge güncellemesi.
8. **Yedek:** `yedek.ps1`'i elle bir kez çalıştırın, çıktı dosyalarını ve dış kopyayı kontrol edin, **§11 geri yükleme testini yapın** (kurulum bitti kriteri).

### 9a. Sağlık kontrolü — `GET /api/saglik`
Oturumsuz, tenant bağlamsız. `200` = sağlıklı ya da disk uyarısı, `503` = veritabanına ulaşılamıyor (`select 1`) ya da `DOSYA_KOKU` diski kritik/okunamıyor. Eşikler: boş alan < 5 GB uyarı, < 1 GB kritik.
- Dışarıdan: `{"durum":"ok|uyari|hata"}` (yalnız durum; ayrıntı sızdırılmaz).
- Yerelden (`curl http://127.0.0.1:3000/api/saglik`, `X-Real-IP` başlığı yok): ayrıca `db`, `db_ms`, `disk`, `disk_bos_gb`. Caddy her istekte `X-Real-IP` ekler, bu yüzden internetten gelen istek ayrıntıyı hiç görmez.
- `guncelle.ps1` ön uçuşta (3999 portu) ve geçişten sonra bunu çağırır. Dış izleme için `https://<alan>/api/saglik` yeterlidir.
- Denendi (2026-10-28, geliştirici makinesi, standalone çıktı): `DATABASE_URL` yokken 503 + ayrıntı yerelde görünür, `X-Real-IP` ile yalnız `{"durum":"hata"}`. Gerçek veritabanıyla 200 yolu sunucuda denenecek.

## 10. Güncelleme ve geri alma

`guncelle.ps1` (Task Scheduler, günlük; yeni commit yoksa çıkar):
`git fetch` → depo temiz mi → `merge --ff-only` → `npm ci` → `npm run build` → `surumler\<tarih>-<sha>` paketi → **ön uçuş** (yeni paket 3999 portunda açılır, `/api/saglik` 200 olmalı; canlıya dokunulmaz) → bekleyen migration varsa **güncelleme öncesi yedek** (`yedek.ps1 -Etiket guncelleme-oncesi`) + `migrasyon-uygula.ps1` → `guncel` bağlantısı yeni sürüme → `Restart-Service klinik-uygulama` → `/api/saglik` (90 sn).

**Hata nerede olursa:**

| Aşama | Sonuç |
|---|---|
| git / `npm ci` / build / paket / ön uçuş | Canlı DEĞİŞMEDİ. `git reset --hard` ile eski commit'e dönülür, yarım paket silinir. Çıkış 1. |
| Yedek ya da migration | Canlı DEĞİŞMEDİ (migration dosya başına atomik). Önceki dosyalar uygulanmış kalabilir (kayıtlıdır). Çıkış 1. |
| Geçiş sonrası sağlık | Bağlantı eski sürüme çevrilir, servis yeniden başlar, sağlık doğrulanır, git eski commit'e alınır. Çıkış 1; geri dönüş de sağlıksızsa **çıkış 2 = elle müdahale**. |

Olay günlüğü (Application, kaynak `KlinikGuncelle`, olay 3000) ve `C:\klinik\log\guncelle-*.log` kaydı tutulur. En yeni 5 sürüm saklanır. Ön uçuş yeni paketi `uygulama.env` ile açtığı için gerçek veritabanına bağlanır ama yalnız `select 1` çalıştırır.

**Sınır:** migration'lar ileri yönlüdür; kod geri dönse de veritabanı yeni şemada kalır. Bu yüzden migration'lar **geriye dönük uyumlu** yazılır (önce kolon/tablo ekle, kod geçsin, sonraki sürümde eskiyi kaldır). Uyumsuz bir migration geri dönüşü bozarsa §11'e göre güncelleme öncesi yedekten dönülür (veri kaybı: yedek ile o an arasındaki yazımlar — uyumsuz migration'dan önce bakım penceresi açın).

**Elle geri alma** (bir sürüm sonradan sorunlu çıkarsa): `Get-ChildItem C:\klinik\surumler` → `cmd /c rmdir C:\klinik\guncel` + `New-Item -ItemType Junction -Path C:\klinik\guncel -Target <eski sürüm klasörü>` → `Restart-Service klinik-uygulama` → `/api/saglik`. Ardından depoda sorunlu commit'i geri alın (`git revert`); aksi hâlde `guncelle.ps1` bir sonraki çalışmada aynı commit'i yeniden dağıtır.

**Açık karar:** migration için süper kullanıcı kimlik bilgisi deploy hesabının `pgpass.conf` dosyasında durur (parola repoda/env'de yok). Daha dar bir `klinik_migrasyon` giriş rolü (`klinik_sahip` üyesi, yalnız localhost) tanımlanabilir; ayrı onay gerektirir, şimdilik uygulanmadı. Ayrıca `migrasyon` şeması `yetki-matrisi.sql` / `bypassrls-kontrol.sql` ile ilk kurulumda birlikte denenmeli (şema `public` dışında, uygulama rollerine yetkisiz).

## 11. Yedekten dönme prosedürü

`yedek.ps1` her gün `<YEDEK_HEDEF_KLASOR>\<tarih>-gunluk.dump.age` (+ `.dosya.tar.age`, `.sha256`), ayın ilkinde `<yyyy-MM>-aylik.*`, güncelleme öncesi `…-guncelleme-oncesi.*` üretir ve aynısını `YEDEK_DIS_KOPYA_HEDEFI`'ne kopyalar (saklama süreleri hedefte de uygulanır; ayrı diskteki kopya fidye yazılımına karşı tam koruma değildir — hedefi yazılabilir ağ paylaşımı yapmayın). Özel anahtar sunucuda yoktur.

**Geri yükleme (test makinesi ya da felaket sonrası yeni sunucu):**
1. Yedek ve `.sha256` dosyalarını (dış kopyadan) alın. `(Get-FileHash -Algorithm SHA256 <dosya>.age).Hash` değeri `.sha256` ile eşleşmeli.
2. Özel anahtarı kasadan **geçici** olarak getirin; `age -d -i <ozel-anahtar.txt> -o klinik.dump <tarih>-gunluk.dump.age`. (Dosya arşivi için `age -d … -o dosya.tar`, sonra `tar -xf dosya.tar -C <DOSYA_KOKU>`.)
3. Yeni sunucuda önce `scripts\db-kur.ps1` yalnız **roller + boş veritabanı** için gerekir; şema dump'tan gelecek. Süper kullanıcıyla: `pg_restore --no-owner --role=klinik_sahip -d klinik --clean --if-exists klinik.dump`. Roller dump'ta yoktur, bu yüzden rol oluşturma adımı (`db/kurulum/00_roller.sql`) önce çalışmış olmalı.
4. `migrasyon-uygula.ps1 -Kontrol`: bekleyen migration varsa kod sürümüne göre uygulayın (dump `migrasyon.kayit` tablosunu da taşır).
5. Doğrulama (§5 madde 4): tablo satır sayıları, Kasa/Banka bakiyesi, `v_hasta_cari_ozet` toplamı, bir hasta belgesi, klinik admin girişi, tenant bağlamsız sorguda 0 satır. `db\kontrol\bypassrls-kontrol.sql` HATA vermemeli.
6. Canlıya alma: `Start-Service klinik-uygulama, klinik-caddy`, `/api/saglik` 200, gerekiyorsa DNS'i yönlendirin.
7. Özel anahtarı ve açık dump/tar dosyalarını güvenli silin; olayı (tarih, yedek adı, geçen süre, sonuç) kayda geçirin.

**Yalnız `guncelleme-oncesi` yedeğinden dönüş:** önce `Stop-Service klinik-uygulama`; dump'ı yukarıdaki gibi **mevcut veritabanının yerine** yükleyin (`--clean --if-exists`); `guncel` bağlantısını eski sürüme çevirin; servisi başlatın. Yedekten sonraki yazımlar kaybolur — kullanıcılara bildirin.

**Denenmedi:** `pg_restore --clean` ile FORCE RLS / rol sahipliklerinin birebir geri geldiği ve `--no-owner --role` birleşiminin bu şemada sorunsuz çalıştığı doğrulanmadı; §5'teki aylık geri yükleme testi bunu ilk kez kanıtlayacak.

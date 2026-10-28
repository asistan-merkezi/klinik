# Sunucu Kurulumu (Windows Server VM)

Durum: tasarım + **dağıtım betikleri yazıldı (`deploy/windows/`), CI iş akışı yazıldı (`.github/workflows/derle.yml`); Windows Server'da HİÇ ÇALIŞTIRILMADI** (sunucu yok; PowerShell sözdizimi ayrıştırıldı, paketleme ve `next build` standalone çıktısı, `/api/saglik`, `klinik_migrasyon` rolü ve kontrol SQL'leri yerelde denendi). §8–§12 adımları **§12 Prova planı** ile ilk kurulumda sırayla denenip düzeltilecek. **Gizli değer yazılmaz**, yalnız değişken adları.

## 1. Bileşenler
Node.js LTS (yalnız çalıştırma; **sunucuda `npm`/derleme yok**) · PostgreSQL (aynı VM, yalnız `localhost`) · NSSM (servisler) · Caddy (TLS, alan adı; yönetim API'si kapalı) · sistem Chrome/Edge (`CHROMIUM_PATH`) · `age` (yedek şifreleme, yalnız ortak anahtar tarafı). Derleme GitHub Actions'ta; sunucu hazır sürüm paketini indirir (§10). Git gerekmez.

## 2. Veritabanı rolleri

| Rol | Giriş | RLS | Yetki | Kullanan |
|---|---|---|---|---|
| `klinik_sahip` | hayır (`NOLOGIN`) | tabi (FORCE) | Tablo/fonksiyon sahibi; DDL | Migration bu rolle sahiplik atar (`scripts/db-kur.ps1`) |
| `klinik_uygulama` | evet | **tabi** | Yalnız gerekli `SELECT/INSERT/UPDATE/DELETE` ve `EXECUTE` | Uygulama (yalnız `DATABASE_URL`) |
| `klinik_anonim` | hayır (uygulama giriş öncesi akışlarda `SET LOCAL ROLE`) | **tabi** | Yalnız anonim akışların dar politikaları/fonksiyonları | QR, portal/personel giriş öncesi, iş başvurusu |
| **`bakim_rolu`** | evet | **tabi (BYPASSRLS DEĞİL)** | `klinik` üzerinde **yalnız SELECT**; bakım fonksiyonlarına EXECUTE; `klinik_uygulama` rolüne üyelik (`SET LOCAL ROLE klinik_uygulama` ile klinik başına iş `withTenant` altında yapılır) | **Yalnız** `scripts/` altındaki bakım betikleri (`BAKIM_DATABASE_URL`). Uygulama süreci bu bilgiyi hiç almaz |
| `kimlik_rolu` | evet | tabi | **Yalnız** `kimlik_kullanici`, `kimlik_hesap`, `oturum`, `kimlik_dogrulama` (Better Auth bağlantısı). Başka hiçbir tabloda/fonksiyonda yetkisi yok; `klinik_uygulama`, `klinik_anonim`, `bakim_rolu` bu tablolarda HİÇBİR yetkiye sahip değil | Better Auth (`KIMLIK_DATABASE_URL`) |
| `klinik_tanima` | hayır (`NOLOGIN`) | tabi | Yalnız `klinik(id, ad, qr_kisa_kod)` ve `randevu(id, klinik_id)` kolonlarını okuyabilir; `tanima` şemasındaki iki DEFINER fonksiyonun sahibi | Giriş öncesi tenant'sız çözümleme (kısa kod → klinik, randevu → klinik) |
| **`klinik_migrasyon`** | evet | **tabi (BYPASSRLS DEĞİL)** | Kendi başına **hiçbir** tablo/şema yetkisi yok; tek yetkisi `klinik_sahip` rolüne `SET ROLE` (`GRANT klinik_sahip TO klinik_migrasyon WITH INHERIT FALSE, SET TRUE`). Süper kullanıcı/rol-DB oluşturma/replikasyon yok | **Yalnız** `migrasyon-uygula.ps1` (`deploy.env > MIGRASYON_DATABASE_URL`). Süper kullanıcının yerine geçer; tenant verisini göremez (FORCE RLS) |
| `klinik_yedek` | evet | **BYPASSRLS** (tek istisna, **ONAYLANDI 2026-10-27**) | **Yalnız SELECT** (`pg_read_all_data`; başka rol üyeliği, yazma, CREATE yok). `pg_hba.conf`'ta yalnız `127.0.0.1/32` ve `::1/128` | Yalnız `yedek.ps1` (parolası yalnız `svc-klinik-yedek` hesabının okuyabildiği `yedek.env`'de) |

**klinik_yedek istisnası (onaylandı):** FORCE RLS altında `pg_dump` BYPASSRLS'siz tabloyu tam okuyamaz; süper kullanıcı yerine yalnız-okuma yetkili dar bir rol seçildi. Koşullar: (1) yalnız SELECT, yazma/DDL yetkisi yok, hiçbir nesnenin sahibi değil; (2) giriş yalnız localhost'tan (aşağıdaki `pg_hba.conf` satırları); (3) parola yalnız yedek hesabının okuyabildiği `yedek.env` dosyasında; (4) `db/kontrol/bypassrls-kontrol.sql` izin listesinde adıyla yer alır (başka hiçbir rol BYPASSRLS olamaz) ve `yetki-matrisi.sql` yazma yetkisini ve rol üyeliklerini denetler; (5) pg_dump kimlik tablolarını da (parola hash'leri dahil) okur — bu yüzden yedek şifreli saklanır ve `klinik_yedek` kimlik tablolarında yetki matrisinin tek izinli istisnasıdır (yalnız SELECT).

`pg_hba.conf` (özet; sıra önemli, `scram-sha-256`):
```
host  klinik  klinik_yedek     127.0.0.1/32  scram-sha-256
host  klinik  klinik_yedek     ::1/128       scram-sha-256
host  klinik  klinik_uygulama  127.0.0.1/32  scram-sha-256
host  klinik  kimlik_rolu      127.0.0.1/32  scram-sha-256
host  klinik  bakim_rolu       127.0.0.1/32  scram-sha-256
host  klinik  klinik_migrasyon 127.0.0.1/32 scram-sha-256
host  klinik  postgres         127.0.0.1/32  scram-sha-256   (+ ::1 karşılıkları; yalnız ilk kurulum/PG bakımı)
host  all     all              0.0.0.0/0     reject
host  all     all              ::/0          reject
```
(`listen_addresses = 'localhost'` ayrıca.) **Bu dosya elle yazılmaz: `kurulum.ps1` yazar ve DOĞRULAR** (her `host` satırı loopback + `scram-sha-256` ya da `reject`; dinleyen adresler yalnız `127.0.0.1`/`::1`; 5432 için açık gelen güvenlik duvarı kuralı yok; yedek dosyaları `.bak-<zaman>`). Ek kontrol: `bypassrls-kontrol.sql` (süper kullanıcıyla çalışınca) `pg_hba_file_rules`'ta loopback dışı, `reject` olmayan `host` satırı bulursa HATA, `scram-sha-256` dışı yöntemde UYARI verir; migration uygulayıcı bu görünümü okuyamadığından o blok atlanır (BILGI satırı).

**Süper kullanıcı (`postgres`) yalnız ilk kurulumda** (`00_roller`, `01_veritabani`, `02_eklentiler`, `03_migrasyon_kaydi`) ve PostgreSQL bakımında kullanılır; hiçbir env dosyasında ve `pgpass.conf`'ta bulunmaz. Migration'lar `klinik_migrasyon` ile uygulanır (§10c). `migrasyon` şeması (`migrasyon.kayit`) ayrı şemadır, sahibi `klinik_sahip`, hiçbir uygulama rolüne yetki yok (`yetki-matrisi.sql` kural 9 + `tests/db/migrasyon-rolu.test.ts`).

Karar: bakim_rolu BYPASSRLS DEĞİL; bakım işi de RLS'ten geçer (klinik başına `app.tenant_id`). Böylece "sistem işi" bile başka kliniğin verisini bir transaction'da karıştıramaz. Sistem bağlamı RPC'lerde `session_user = 'bakim_rolu'` ile tanınır (bkz. `docs/service-role-siniflama.md`).

**Tüm tenant tablolarında `ALTER TABLE … FORCE ROW LEVEL SECURITY`.** Hiçbir fonksiyonun sahibi RLS'i atlayan bir rol olmaz; fonksiyonlar `klinik_sahip` sahipliğindedir. Doğrulama: `db/kontrol/bypassrls-kontrol.sql` (`scripts/db-kur.ps1` içinde çalışır). Tenant olmayan tablolar `docs/sema-esleme.md`'de listelenir.

## 3. Ortam değişkenleri ve gizli dosyalar (yalnız adlar)

`CRON_SECRET` **yoktur** (HTTP cron kalktı). Windows hesapları ve dosyalar:

| Windows hesabı | Ne çalıştırır | Okuyabildiği gizli dosya |
|---|---|---|
| `NT SERVICE\klinik-uygulama` (sanal servis hesabı, parolasız) | NSSM servisi (Next.js) | `C:\klinik\gizli\uygulama.env` |
| `NT SERVICE\klinik-caddy` (sanal servis hesabı, parolasız) | NSSM servisi (Caddy) | — (gizli dosya yok) |
| `svc-klinik-bakim` (yerel kullanıcı) | Task Scheduler görevleri (`scripts/*.mjs`) | `C:\klinik\gizli\bakim.env` |
| `svc-klinik-yedek` (yerel kullanıcı) | `yedek.ps1` | `C:\klinik\gizli\yedek.env` |
| Deploy hesabı (yönetici) | `guncelle.ps1` (Task Scheduler), `migrasyon-uygula.ps1` | `C:\klinik\gizli\deploy.env` (yalnız `SYSTEM`/`Administrators`) |

**`uygulama.env`**: `DATABASE_URL` (klinik_uygulama) · `KIMLIK_DATABASE_URL` (kimlik_rolu — Better Auth; uygulama süreci iki bağlantı havuzu kullanır) · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL` · `DOSYA_KOKU` · `CHROMIUM_PATH` · `MESAJ_MERKEZ_BASE_URL` · `MESAJ_MERKEZ_API_KEY` · `DESTEK_CHATBOT_ACIK` (varsayılan kapalı) · `GIZLI_VERI_ANAHTARI` (32 bayt, base64; veritabanında saklanan dış servis gizlilerini — Paraşüt client secret — şifreler; **yedekten AYRI saklanmalı**: yedek + anahtar birlikte ele geçirilirse gizliler çözülür; anahtar kaybolursa kayıtlı gizliler yeniden girilmelidir).
**`bakim.env`**: `BAKIM_DATABASE_URL` (bakim_rolu) · `MESAJ_MERKEZ_BASE_URL` · `MESAJ_MERKEZ_API_KEY` (kuyruk işçisi ve kredi senkronu için). **`DATABASE_URL` ve `BETTER_AUTH_SECRET` burada YOKTUR.**
**`deploy.env`**: `GITHUB_REPO` (`sahip/depo`) · `GITHUB_DEPLOY_TOKEN` (fine-grained, yalnız Contents:Read) · `MIGRASYON_DATABASE_URL` (klinik_migrasyon; yalnız localhost) · isteğe bağlı `GITHUB_TOKEN_SON_KULLANMA` (YYYY-MM-DD; jeton son kullanma tarihi notu, GitHub başlığı gelmezse kullanılır). Uygulama/bakım/yedek/caddy hesaplarına Deny (§10a). `uygulama.env`'e ayrıca `GUNCELLEME_DURUM_DOSYASI=C:\klinik\durum\jeton.json` (§9a).
**`yedek.env`**: `YEDEK_DATABASE_URL` (klinik_yedek; yalnız localhost) · `YEDEK_HEDEF_KLASOR` · `YEDEK_ALICI_ANAHTARI` (age ortak anahtarı) · `YEDEK_GUNLUK_SAKLAMA_GUN` (30) · `YEDEK_AYLIK_SAKLAMA_AY` (12) · `YEDEK_DIS_KOPYA_HEDEFI`.

### NTFS izinleri
Miras kapalı, yalnız ilgili hesap; çapraz hesaplara açık **Deny**. Tek kaynak: `deploy/windows/ortak.ps1 > GizliIzinleriUygula` (`kurulum.ps1` ve `servis-kur.ps1` çağırır; servis sanal hesapları ancak servis kurulunca çözülür, bu yüzden iki kez):
- `gizli`: yalnız SYSTEM/Administrators; hesaplara yalnız gezinme `(X)`. Dosya bazında: `uygulama.env` → `NT SERVICE\klinik-uygulama` R; `bakim.env` → `svc-klinik-bakim` R; `yedek.env` → `svc-klinik-yedek` R; `deploy.env` → kimseye (yalnız yönetici). Her dosyada diğer hesaplara `deny (R,RX)`.
- `surumler`: uygulama + bakım hesabı RX (kod **salt-okunur**); `indirme`: yalnız yönetici; `log`: uygulama/caddy/bakım Modify; `dosya`: uygulama Modify, yedek RX; `yedek`: yedek Modify; `caddy-veri`: caddy Modify.

**Doğrulama (bitti kriteri)**: `svc-klinik-bakim` ile (`runas`) `type C:\klinik\gizli\uygulama.env` → "Erişim engellendi"; uygulama sürecinin ortamında `BAKIM_DATABASE_URL`/`MIGRASYON_DATABASE_URL` görünmüyor; `icacls C:\klinik\guncel\server.js` uygulama hesabı için yalnız `RX`. Yönetici hesapları dosyaları okuyabilir (sunucu yöneticisine güven varsayılır; Administrators üyeleri ayrıca belgelenir).
Betikler `node --env-file=C:\klinik\gizli\bakim.env C:\klinik\guncel\scripts\<is>.mjs` ile başlar (bakım betiklerinin paketlenmesi Modül 7) ve env değerlerini loga yazmaz. Aynı Windows hesabının süreçleri birbirinin ortamını okuyabildiğinden ayrım **hesap** düzeyindedir.

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
§8–§12 dağıtım, güncelleme, yedekten dönme ve prova planını içerir. Denenmemiş komut "denendi" diye işaretlenmez: ilk sunucu kurulumunda her adımın yanına tarih/sonuç yazılır.

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

**İlke:** sunucuda derleme YOK. Sürüm paketi GitHub Actions'ta (`.github/workflows/derle.yml`) üretilir; sunucu hazır paketi indirir, özetini doğrular, açar ve çalıştırır. Sunucuda `git`, `npm ci`, `next build` çalışmaz; yalnız Node (server.js + bakım betikleri), PostgreSQL araçları, Caddy, NSSM, age, Chrome/Edge gerekir.

| Dosya | Görev |
|---|---|
| `.github/workflows/derle.yml` | İki bağımsız iş. **`derle`** (`windows-latest`, Node LTS `.nvmrc`): `npm ci` → lint → `tsc` → test → `next build` (standalone) → `paketle.ps1`. **`veritabani`** (`ubuntu-latest`, Postgres 18 servis konteyneri): `npm run test:db` + `node scripts/dev/kontrol-calistir.mjs` (test düzeneği `TEST_PG_DIS_PORT` ile bu kümeye bağlanır). `v*` etiketinde (ikisi de geçerse) **TASLAK** GitHub sürümü + `klinik-<etiket>.zip` + `.sha256`; taslak, imzalanıp yayınlanana kadar sunucularca görülmez. Derleme işi salt-okunur izinli; yalnız yayın işi `contents: write` ister; imza anahtarı CI'da YOK. |
| `scripts/yayin-imzala.ps1` | **Geliştirici bilgisayarında** çalışır: taslak sürümün zip'ini indirir, özetini Actions özetiyle karşılaştırtır, **minisign** ile imzalar (`.minisig`), açık anahtarla doğrular, yükler, `-Yayinla` ile taslağı yayınlar (§10d). Özel anahtar depoya/CI'a/sunucuya girmez. |
| `paketle.ps1` | Standalone çıktı + `.next/static` + `public` + `db/{migrations,kontrol,kurulum,seed}` + `deploy/windows` + `scripts/db-kur.ps1` + `SURUM.txt` → zip + `.sha256`. Pakette `.env*`, `*.pem`, `deploy.env` varsa başarısız olur. |
| `kurulum.ps1` | Saat dilimi, araç denetimi, klasörler + NTFS izinleri, bakım/yedek yerel hesapları, **PostgreSQL sertleştirme + doğrulama**, güvenlik duvarı (yalnız 80/443). İdempotent. `-Indir` winget ile eksikleri kurar. |
| `servis-kur.ps1` | `klinik-uygulama` ve `klinik-caddy` NSSM servisleri, **`NT SERVICE\<servis>` sanal hesaplarıyla** (parola yok); izinleri tamamlar; Caddy yönetim uç noktasının kapalı olduğunu doğrular. |
| `Caddyfile` | Global `admin off`; alan adı → `localhost:3000`, otomatik HTTPS, güvenlik başlıkları, proxy zaman aşımı 90–120 sn, SSE (`/api/canli`) arabelleksiz, erişim logu döner. Cloudflare IP kısıtı **pasif not** (§3c: proxy kapalı). |
| `guncelle.ps1` | Paket + `.sha256` + `.minisig` indir → SHA256 doğrula → **imza doğrula (açmadan reddet)** → aç → ön uçuş → migration → geçiş → sağlık → hata olursa önceki sürüme dön (§10). Jeton süresini izler (§10e). Task Scheduler ile. |
| `migrasyon-uygula.ps1` | `db/migrations` için kayıtlı, dosya başına atomik uygulayıcı; **`klinik_migrasyon`** ile (süper kullanıcı değil). |
| `yedek.ps1` | Günlük şifreli yedek + saklama + ayrı diske kopya (§4; geri yükleme §11). |
| `ortak.ps1` | Ortak yardımcılar (NTFS izinleri, GitHub indirme, env okuma). |
| `env.production.ornek` | Yalnız değişken adları: `uygulama.env`, `bakim.env`, `yedek.env`, `deploy.env`. |

Betikler UTF-8 **BOM'lu** kaydedilir (Windows PowerShell 5.1 BOM'suz dosyayı ANSI okur, Türkçe karakterde sözdizimi hatası verir); düzenlerken BOM'u koruyun.

Klasörler (`C:\klinik`): `surumler\<etiket>-<zaman>` (çalışan paketler; uygulama hesabına **salt-okunur**) · `guncel` (junction → çalışan sürüm; NSSM `AppDirectory`) · `indirme` (geçici zip; yalnız yönetici) · `anahtarlar` (güvenilen yayın **açık anahtarları** `*.pub`; yalnız yönetici) · `durum` (`jeton.json`; yönetici yazar, uygulama salt-okur) · `gizli` · `log` · `dosya` (`DOSYA_KOKU`) · `yedek` · `caddy-veri`. Bakım betikleri (`scripts\*.mjs`, Modül 7) `guncel` içinden çalışacaktır; **bakım betiklerinin pakete nasıl girdiği (esbuild ile tek dosya) Modül 7'de netleşir** — şimdilik pakette yalnız `scripts\db-kur.ps1` vardır.

`CHROMIUM_PATH` ortam değişkeni `lib/pdf/browser.ts` tarafından okunur (eski `PUPPETEER_EXECUTABLE_PATH` yedek olarak durur). `next.config.ts` `output: "standalone"`.

### 8a. Servis hesapları — `NT SERVICE\<servis>` (sanal hesaplar)
`klinik-uygulama` ve `klinik-caddy` servisleri, Windows'un servis adından türettiği **sanal servis hesaplarıyla** çalışır: `NT SERVICE\klinik-uygulama`, `NT SERVICE\klinik-caddy`. Parolası yoktur → parola oluşturma, saklama, rotasyon ve süre dolması riski yoktur; hesap yalnız o servise aittir ve ağda makine hesabı kimliğiyle görünür (yerel kaynaklara erişimde sorun değil; uygulama yalnız localhost'a bağlanır).
- **NSSM:** `nssm set klinik-uygulama ObjectName "NT SERVICE\klinik-uygulama"` (parola argümanı verilmez). `servis-kur.ps1` bunu uygular ve `sc.exe qc klinik-uygulama` çıktısında `SERVICE_START_NAME : NT SERVICE\klinik-uygulama` görmeyi **doğrular**; NSSM kabul etmezse yedek yol `sc.exe config klinik-uygulama obj= "NT SERVICE\klinik-uygulama"` (parolasız) kullanılır. Sunucuda denenecek.
- **NTFS:** servis kurulmadan hesap çözülemez; bu yüzden izinler `ortak.ps1 > GizliIzinleriUygula` ile hem `kurulum.ps1`'de (çözülebilenler) hem `servis-kur.ps1` sonunda (hepsi) uygulanır. Uygulama: `surumler` RX (kod salt-okunur), `dosya` + `log` Modify, `gizli\uygulama.env` Read. Caddy: `caddy-veri` + `log` Modify. Uygulama hesabına `bakim.env`/`yedek.env`/`deploy.env` için açık Deny konur.
- Bakım ve yedek Task Scheduler görevleri için **yerel kullanıcılar** (`svc-klinik-bakim`, `svc-klinik-yedek`) kalır (Task Scheduler sanal servis hesabı kullanamaz). `kurulum.ps1` bunlar için: **40 karakterlik rastgele parola** üretir (kriptografik RNG); parola **yalnız kurulum çıktısında bir kez** gösterilir, hiçbir dosyaya/loga yazılmaz (kurulum için `Start-Transcript` kullanmayın; ekranı kapatmadan parola yöneticisine kaydedin, görev kaydında bir kez girilir). Kaybolursa `kurulum.ps1 -ParolaSifirla` yenisini üretir, görev yeniden kaydedilir. Haklar (LSA API'siyle verilir ve **doğrulanır**): **Toplu iş olarak oturum aç** (`SeBatchLogonRight`) VERİLİR; **Yerel olarak oturum açmayı reddet** (`SeDenyInteractiveLogonRight`) ve **Uzak Masaüstü Hizmetleri ile oturum açmayı reddet** (`SeDenyRemoteInteractiveLogonRight`) EKLENİR. Kontrol: `secpol.msc > Yerel İlkeler > Kullanıcı Hakları Atama`.

## 9. Adım adım ilk kurulum

Yönetici PowerShell (5.1 ya da 7). Her adımdan sonra çıktıyı kontrol edin. Ayrıntılı, beklenen çıktılı tam zincir: **§12 Prova planı**.

1. **İlk paket (elle):** YAYINLANMIŞ (imzalı) sürümden `klinik-<etiket>.zip`, `.zip.sha256` ve `.zip.minisig` dosyalarını (tarayıcı/`gh release download`, başka makineden) sunucuya `C:\klinik\ilk\` altına alın. Özet `(Get-FileHash -Algorithm SHA256 .\klinik-<etiket>.zip).Hash` ile `.sha256` eşleşmeli; imza `minisign -V -m klinik-<etiket>.zip -p <geliştiricinin açık anahtarı>` ile doğrulanmalı (açık anahtarı geliştiriciden **ayrı bir kanaldan** alın, §10d). Ancak sonra `tar -xf klinik-<etiket>.zip -C C:\klinik\ilk\paket`.
2. **Hazırlık:** `C:\klinik\ilk\paket\deploy\windows\kurulum.ps1 -Indir`. PostgreSQL kurulu olmalı (kurulum.ps1 `pg_hba.conf` + `listen_addresses` sertleştirir ve doğrular). Çıktıdaki Chrome/Edge yolunu not edin.
3. **Veritabanı (süper kullanıcı YALNIZ burada):** oturumluk `PGPASSWORD` (postgres) ve `KLINIK_UYGULAMA_SIFRE`, `KLINIK_KIMLIK_SIFRE`, `KLINIK_BAKIM_SIFRE`, `KLINIK_YEDEK_SIFRE`, `KLINIK_MIGRASYON_SIFRE` ortam değişkenleriyle `C:\klinik\ilk\paket\scripts\db-kur.ps1`. Betik roller → veritabanı → eklentiler → `migrasyon` şeması → migration'lar → kontroller (`bypassrls-kontrol`, `yetki-matrisi`) → `migrasyon.kayit` kaydını işler. Bitince `Remove-Item Env:PGPASSWORD`, varsa `pgpass.conf`'tan `postgres` satırı silinir; üretim işletiminde süper kullanıcı parolası parola yöneticisindedir (PostgreSQL yükseltmesi/felaket durumu için).
4. **Açık anahtar:** geliştiricinin minisign açık anahtarını (`klinik.pub`) `C:\klinik\anahtarlar\` altına koyun (§10d; paketten ALINMAZ). **Gizli dosyalar:** `env.production.ornek` bölümlerini `C:\klinik\gizli\uygulama.env`, `bakim.env`, `yedek.env`, `deploy.env` olarak oluşturun (§10a). `kurulum.ps1`'i tekrar çalıştırın (izinler uygulanır).
5. **İlk sürüm:** `.\guncelle.ps1 -IlkKurulum -YerelPaket C:\klinik\ilk\klinik-<etiket>.zip` (`.sha256` ve `.minisig` yanında olmalı; özet ve imza doğrulanır, `surumler\...` açılır, ön uçuş, `guncel` kurulur). Sonraki güncellemeler GitHub'dan gelir.
6. **Servisler:** `C:\klinik\guncel\deploy\windows\servis-kur.ps1 -AlanAdi klinik.firma.com.tr`. DNS A kaydı sunucunun genel IP'sine (Cloudflare **gri bulut**); 80/443 dışarıdan erişilebilir olmalı; Caddy sertifikayı kendisi alır.
7. **Zamanlanmış işler:** §3b bakım görevleri; `yedek.ps1` (`svc-klinik-yedek`, günlük gece); `guncelle.ps1 -GorevKaydet -GorevSaati 04:00 -GorevHesabi <deploy hesabı>`. Hepsinde "çalışan örnek varken yenisini başlatma".
8. **Sağlık + duman testi:** §9a; tarayıcıdan giriş, bir PDF, bir canlı çizelge güncellemesi.
9. **Yedek:** `yedek.ps1`'i elle bir kez çalıştırın, çıktıları ve dış kopyayı kontrol edin, **§11 geri yükleme testini yapın** (kurulum bitti kriteri).

### 9a. Sağlık kontrolü — `GET /api/saglik`
Oturumsuz, tenant bağlamsız. `200` = sağlıklı ya da disk uyarısı, `503` = veritabanına ulaşılamıyor (`select 1`) ya da `DOSYA_KOKU` diski kritik/okunamıyor. Eşikler: boş alan < 5 GB uyarı, < 1 GB kritik.
- Dışarıdan: `{"durum":"ok|uyari|hata"}` (yalnız durum).
- Yerelden (`curl http://127.0.0.1:3000/api/saglik`, `X-Real-IP` başlığı yok): ayrıca `db`, `db_ms`, `disk`, `disk_bos_gb` ve `GUNCELLEME_DURUM_DOSYASI` tanımlıysa `guncelleme_jetonu` (`ok`/`yaklasiyor`/`dolmus`/`reddedildi`/`kontrol_eski`/`bilinmiyor`) ile `jeton_kalan_gun`. Jeton `ok` değilse genel durum `uyari` olur (HTTP 200 kalır); **dışarıya yine yalnız `{"durum":…}` döner**, jeton ayrıntısı sızmaz. `kontrol_eski` = durum dosyası 72 saatten eski (güncelleme görevi çalışmıyor). Dosyada jetonun kendisi yoktur. Caddy her istekte `X-Real-IP` ekler; internetten gelen istek ayrıntıyı görmez.
- `guncelle.ps1` ön uçuşta (3999 portu) ve geçişten sonra bunu çağırır. Dış izleme için `https://<alan>/api/saglik` yeterlidir.
- Denendi (2026-10-28, geliştirici makinesi, standalone çıktı): `DATABASE_URL` yokken 503 + ayrıntı yerelde görünür, `X-Real-IP` ile yalnız `{"durum":"hata"}`. Gerçek veritabanıyla 200 yolu sunucuda denenecek.

## 10. Güncelleme (GitHub sürüm paketi) ve geri alma

### 10a. Jeton, ağ çıkışı, `deploy.env`
- **Jeton:** GitHub **fine-grained personal access token**, yalnız bu depo, izin **Contents: Read-only** (sürüm eklerini indirir; yazma yok). Süre sonu ZORUNLU ayarlanır (en çok 90 gün). Sürüm ekleri depo özel olduğundan yalnız jetonla iner (deploy anahtarı yetmez). Süre izleme ve **yenileme prosedürü: §10e**.
- **Saklama:** `C:\klinik\gizli\deploy.env` içinde `GITHUB_REPO=sahip/depo`, `GITHUB_DEPLOY_TOKEN=…`, `MIGRASYON_DATABASE_URL=…` (klinik_migrasyon). NTFS: miras kapalı, yalnız `SYSTEM` + `Administrators`; uygulama/bakım/yedek/caddy hesaplarına açık **Deny** (`GizliIzinleriUygula`). Dürüst sınır: görevi çalıştıran deploy hesabı yönetici olduğundan "yalnız deploy hesabı okur" = yalnız yöneticiler okur; sunucu yöneticilerine güven varsayılır. Jeton hiçbir loga/olay günlüğüne/komut satırına yazılmaz (`GitHubGetir` hatalarında yer almaz; yönlendirilen depolama adresine **gönderilmez**).
- **Ağ çıkışı:** sunucudan yalnız **GitHub'a 443** çıkışı gerekir: `api.github.com` (sürüm sorgusu ve ek indirme) ve eklerin yönlendirildiği depolama adresi (`*.githubusercontent.com` — GitHub bu adı değiştirebilir). Windows güvenlik duvarı IP tabanlıdır, FQDN süzemez; bu yüzden çıkış kısıtı **bulut sağlayıcı/ağ güvenlik duvarı ya da çıkış vekili** katmanında alan adı bazında yapılmalı (Vodafone Cloud tarafında bir karar maddesi). Caddy/Let's Encrypt için ayrıca ACME çıkışı (`acme-v02.api.letsencrypt.org` 443) ve mesaj merkezi adresi gerekir. Başka hiçbir çıkış açılmaz.
- **Bütünlük ve doğruluk:** `.sha256` aynı sürüm ekinde yayınlanır; **yalnız bozuk/eksik indirmeyi** yakalar (aynı hesap hem zip'i hem özeti değiştirebilir). Paketin gerçekten geliştirici tarafından yayınlandığını **minisign imzası** kanıtlar (§10d): imza özel anahtar olmadan üretilemez ve özel anahtar GitHub'da yoktur; GitHub hesabı ele geçirilse bile sahte paket imzadan geçemez. İmza doğrulanmadan paket açılmaz/çalıştırılmaz.

### 10b. `guncelle.ps1` akışı
`GET /repos/<repo>/releases/latest` (ya da `-Surum <etiket>`) → `SURUM.txt` aynıysa çık → `.zip` + `.sha256` indir (`indirme\`) → boyut + **SHA256 doğrula** (uyuşmazsa paket KULLANILMAZ) → **minisign imzasını doğrula** (`.minisig` eki yoksa, güvenilen anahtar yoksa ya da hiçbiriyle doğrulanamıyorsa paket AÇILMADAN reddedilir; imzalı yorum `klinik-<etiket>` olmalı) → `surumler\<etiket>-<zaman>` altına `tar -xf` → paket denetimi (server.js, SURUM.txt, db/, deploy/, `.next/static`; gizli dosya benzeri dosya yok) → **ön uçuş** (yeni paket 3999 portunda açılır, `/api/saglik` 200; canlıya dokunulmaz) → bekleyen migration varsa **güncelleme öncesi yedek** (`yedek.ps1 -Etiket guncelleme-oncesi`) + yeni paketin `migrasyon-uygula.ps1`'i → `guncel` bağlantısı yeni sürüme → `Restart-Service klinik-uygulama` → `/api/saglik` (90 sn).

| Hata aşaması | Sonuç |
|---|---|
| sürüm sorgusu / indirme / özet / **imza** / açma / paket denetimi / ön uçuş | Canlı DEĞİŞMEDİ; yarım klasör silinir. Çıkış 1. İmza reddi ayrıca olay günlüğüne **Error, olay 3501**. |
| GitHub jetonu reddedildi (401/403) | Canlı DEĞİŞMEDİ. Çıkış **3**, olay günlüğü **Error 3401**, durum dosyası `reddedildi` (§10e). |
| yedek ya da migration | Canlı DEĞİŞMEDİ (migration dosya başına atomik; önceki dosyalar uygulanmış kalabilir, kayıtlıdır). Çıkış 1. |
| geçiş sonrası sağlık | Bağlantı eski sürüme çevrilir, servis yeniden başlar, sağlık doğrulanır. Çıkış 1; geri dönüş de sağlıksızsa **çıkış 2 = elle müdahale**. |

Olay günlüğü (Application, `KlinikGuncelle`: 3000 genel, 3010 jeton süresi uyarısı, 3401 jeton reddedildi, 3501 imza reddedildi) ve `C:\klinik\log\guncelle-*.log` kaydı tutulur. En yeni 5 sürüm + çalışan + önceki saklanır.

**Elle sürüme geçme/geri dönme:** `.\guncelle.ps1 -Surum v1.4.1` (eski etiket de olur; migration'lar ileri yönlü olduğundan §10c sınırı geçerli). GitHub'a erişilemiyorsa: paketi elle indirip `-YerelPaket <zip>` (yanında `.sha256` şart). Hızlı geri dönüş (saniyeler): `cmd /c rmdir C:\klinik\guncel`, `New-Item -ItemType Junction -Path C:\klinik\guncel -Target C:\klinik\surumler\<eski>`, `Restart-Service klinik-uygulama`, `/api/saglik`.

### 10c. Migration rolü ve kuralları
- **Rol:** `klinik_migrasyon` (LOGIN, süper kullanıcı değil, BYPASSRLS yok, rol/DB oluşturamaz). Tek yetkisi `klinik_sahip` rolüne `SET ROLE` etmek (`INHERIT FALSE`); kendi başına hiçbir tablo/şema yetkisi yok. Bu yüzden tenant verisini görmez (FORCE RLS). Bağlantısı `deploy.env > MIGRASYON_DATABASE_URL`; `pg_hba`'da yalnız localhost.
- **Süper kullanıcı** (`postgres`) yalnız ilk kurulumda (roller, veritabanı, eklentiler, `migrasyon` şeması) ve PostgreSQL bakımında kullanılır; **pgpass.conf'ta ve hiçbir env dosyasında bulunmaz**. Migration'lar rol/veritabanı/eklenti OLUŞTURAMAZ; böyle bir ihtiyaç `db/kurulum/` altına yeni numaralı dosya olarak eklenir ve süper kullanıcıyla elle, bir kez uygulanır.
- **Takip:** `migrasyon.kayit` (dosya, sha256, uygulandı). Ayrı şema; hiçbir uygulama rolüne yetki yok (`yetki-matrisi.sql` denetler, testi `tests/db/migrasyon-rolu.test.ts`). Her migration sonrası `bypassrls-kontrol.sql` ve `yetki-matrisi.sql` çalışır; HATA varsa güncelleme başarısız olur ve canlı sürüm değişmez.
- **Kurallar:** CLAUDE.md "Migration kuralları" (geriye dönük uyumlu: genişlet → taşı → daralt; geri alma = yedekten dönme). Uygulanmış migration dosyası düzenlenmez (özet uyuşmazsa uyarı).

### 10d. Paket imzası (minisign)

**Neden:** SHA256 aynı yerden gelir; GitHub hesabı/jetonu ele geçirilirse saldırgan zip'i ve özeti birlikte değiştirir. İmza, geliştiricinin bilgisayarındaki özel anahtarla atılır; sunucu yalnız açık anahtarla doğrular. SHA256 kontrolü **kalır** (bozuk indirme tespiti); imza ek katmandır.

**Yayın akışı (geliştirici):** `v*` etiketi → CI paketi derler, **taslak** sürüm açar → `scripts/yayin-imzala.ps1 -Etiket vX.Y.Z -Yayinla`: zip'i indirir, özetini ekrana yazıp **Actions çalışmasının Summary sayfasındaki SHA256 ile aynı mı** diye onay ister, `minisign -S` ile imzalar (imzalı yorum `klinik-vX.Y.Z`), imzayı açık anahtarla doğrular, `klinik-vX.Y.Z.zip.minisig` ekini yükler ve taslağı yayınlar. İmzasız bir sürüm hiçbir zaman "latest" olmaz; yayınlansa bile sunucu reddeder.

**Anahtarlar:**
- Üretim (bir kez, geliştirici bilgisayarında): `minisign -G -p %USERPROFILE%\.minisign\klinik.pub -s %USERPROFILE%\.minisign\klinik.key` (özel anahtar **parola korumalı**). `*.key` ve `.minisign/` `.gitignore`'dadır; betik anahtarın bir git deposu içinde olmasını reddeder. Özel anahtarın şifreli yedeği çevrimdışı kasada (en az 2 kopya, farklı kişi/konum); CI'a, GitHub gizlilerine, sunucuya, e-postaya KONMAZ.
- **Açık anahtarın sunucuya yerleşimi:** `klinik.pub` dosyası `C:\klinik\anahtarlar\` altına **elle**, paketten bağımsız bir kanaldan konur (USB/yüz yüze/imzalı e-posta). Paketin içindeki hiçbir dosya güvenilen anahtar sayılmaz. Yerleştirirken **anahtar kimliğini** (`.pub` dosyasının ilk satırı: `untrusted comment: minisign public key <KİMLİK>`) geliştirici ile sesli/yüz yüze doğrulayın ve kayda geçirin. Klasörü yalnız `SYSTEM`/`Administrators` yazabilir (`ortak.ps1`). Sunucu, klasördeki **herhangi** bir `.pub` ile doğrulanan imzayı kabul eder.
- **Rotasyon (planlı, örn. yılda bir ya da kişi değişince):** (1) yeni çift üret; (2) yeni `.pub`'u her sunucuda **eskisinin yanına** koy (kimlik doğrulaması ile); (3) sonraki sürümleri yeni anahtarla imzala (eski anahtar da hâlâ geçerli, kesinti yok); (4) tüm sunucular yeni anahtarla imzalı bir sürümü başarıyla aldıktan sonra eski `.pub` dosyasını sil; (5) eski özel anahtarı güvenle yok et. **Acil iptal (anahtar sızdı/kayboldu):** sızan anahtarın `.pub`'unu sunuculardan HEMEN sil (bu andan sonra o anahtarla imzalı hiçbir şey kabul edilmez), yeni çift üret, yeni `.pub`'u kimlik doğrulamasıyla yerleştir, yeni sürüm imzala; sızıntı öncesi imzalı sürümler de yeniden imzalanmadan kurulamaz.
- Eski sürüm saldırısı: imzalı yorum `klinik-<etiket>` ile sürüm etiketine bağlıdır; eski bir sürümün geçerli imzası yeni sürümmüş gibi sunulursa `guncelle.ps1` reddeder (ayrıca `SURUM.txt` etiketi denetlenir).

**Reddedilen durumlar (hepsinde paket AÇILMAZ, canlı sürüm değişmez, çıkış 1, olay 3501):** `.minisig` eki yok · güvenilen `.pub` yok · imza hiçbir güvenilen anahtarla doğrulanmıyor (bozuk imza, değiştirilmiş zip, yanlış anahtar) · imzalı yorum beklenen etiketle uyuşmuyor. Provası: §12 adım 18–21.

### 10e. Jeton ömrü ve yenileme prosedürü

**İzleme:** her `guncelle.ps1` çalışmasında (jeton kabul edilince) son kullanma zamanı GitHub'ın `github-authentication-token-expiration` yanıt başlığından alınır (başlık gelmezse `deploy.env > GITHUB_TOKEN_SON_KULLANMA=YYYY-MM-DD` notu) ve `C:\klinik\durum\jeton.json`'a yazılır (`kontrol`, `durum`, `sonKullanma`; jetonun kendisi YOK). **14 gün ve altında** kalınca olay günlüğüne **Warning 3010** düşer ve `/api/saglik` iç ayrıntıda `guncelleme_jetonu: yaklasiyor` gösterir (genel durum `uyari`). Jeton **reddedilirse** (401/403) betik canlı sürüme dokunmaz, **çıkış kodu 3**, olay günlüğüne **Error 3401** yazar, durum dosyası `reddedildi` olur. Görev hiç çalışmazsa durum dosyası 72 saat sonra `kontrol_eski` olur. Dışarıya yalnız `{durum}` gider. İzleme (UptimeRobot vb.) `uyari`'yı e-postaya bağlayabilir; ayrıca Olay Görüntüleyici'de 3010/3401 için görev bağlanabilir.

**Yenileme prosedürü (jeton dolmadan ~2 hafta önce, uyarı geldiğinde):**
1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → *Generate new token*: Resource owner = kuruluş/hesap, **Repository access: Only select repositories → yalnız bu depo**, Permissions: **Contents: Read-only** (başka izin YOK), Expiration ≤ 90 gün. Jeton değerini yalnız bir kez gösterilen ekrandan kopyalayın (e-posta/sohbet/not defterine yapıştırmayın).
2. Sunucuda yönetici olarak `C:\klinik\gizli\deploy.env` dosyasında `GITHUB_DEPLOY_TOKEN=` değerini yenisiyle değiştirin (dosya izinleri bozulmasın: dosyayı yeniden oluşturmak yerine yerinde düzenleyin; gerekirse `ortak.ps1 > GizliIzinleriUygula`'yı yeniden çalıştırmak için `kurulum.ps1`). `GITHUB_TOKEN_SON_KULLANMA` notunu kullanıyorsanız yeni tarihe güncelleyin.
3. Hemen doğrulayın: `C:\klinik\guncel\deploy\windows\guncelle.ps1 -Zorla:$false` (yeni sürüm yoksa "Yeni surum yok" yazıp **çıkış 0** ile bitmesi jetonun çalıştığını gösterir) ve `C:\klinik\durum\jeton.json` içinde `durum: ok` ve yeni `sonKullanma`; `curl http://127.0.0.1:3000/api/saglik` → `guncelleme_jetonu: ok`.
4. **Eski jetonu GitHub'da iptal edin** (Revoke). Yenileme tarihini ve sonraki yenileme tarihini kayda/takvime işleyin.
5. Jeton sızdı şüphesi: önce eskisini iptal edin (sunucu çıkış 3 verir ama canlı bozulmaz), sonra 1–3'ü uygulayın; GitHub denetim günlüğünde jetonun kullanımını inceleyin.

**Jeton dolduysa/reddedildiyse:** uygulama çalışmaya devam eder, yalnız güncelleme alınamaz. Yeni bir güvenlik düzeltmesi bekliyorsa acil yol: paketi başka makineden indirip `guncelle.ps1 -YerelPaket …` (yanında `.sha256` ve `.minisig`; imza yine doğrulanır).

## 11. Yedekten dönme prosedürü

`yedek.ps1` her gün `<YEDEK_HEDEF_KLASOR>\<tarih>-gunluk.dump.age` (+ `.dosya.tar.age`, `.sha256`), ayın ilkinde `<yyyy-MM>-aylik.*`, güncelleme öncesi `…-guncelleme-oncesi.*` üretir ve aynısını `YEDEK_DIS_KOPYA_HEDEFI`'ne kopyalar (saklama süreleri hedefte de uygulanır; ayrı diskteki kopya fidye yazılımına karşı tam koruma değildir — hedefi yazılabilir ağ paylaşımı yapmayın). Özel anahtar sunucuda yoktur.

**Geri yükleme (test makinesi ya da felaket sonrası yeni sunucu):**
1. Yedek ve `.sha256` dosyalarını (dış kopyadan) alın. `(Get-FileHash -Algorithm SHA256 <dosya>.age).Hash` değeri `.sha256` ile eşleşmeli.
2. Özel anahtarı kasadan **geçici** olarak getirin; `age -d -i <ozel-anahtar.txt> -o klinik.dump <tarih>-gunluk.dump.age`. (Dosya arşivi için `age -d … -o dosya.tar`, sonra `tar -xf dosya.tar -C <DOSYA_KOKU>`.)
3. Yeni sunucuda roller + boş veritabanı için `db/kurulum/00_roller.sql`, `01_veritabani.sql`, `02_eklentiler.sql` (süper kullanıcıyla; `scripts\db-kur.ps1`'in ilk üç adımı) çalışmış olmalı; şema dump'tan gelir. Süper kullanıcıyla: `pg_restore --no-owner --role=klinik_sahip -d klinik --clean --if-exists klinik.dump`. Dump `migrasyon.kayit`'i de taşır.
4. `migrasyon-uygula.ps1 -Kontrol`: bekleyen migration varsa kod sürümüne göre uygulayın.
5. Doğrulama (§5 madde 4): tablo satır sayıları, Kasa/Banka bakiyesi, `v_hasta_cari_ozet` toplamı, bir hasta belgesi, klinik admin girişi, tenant bağlamsız sorguda 0 satır. `bypassrls-kontrol.sql` ve `yetki-matrisi.sql` HATA vermemeli.
6. Canlıya alma: `Start-Service klinik-uygulama, klinik-caddy`, `/api/saglik` 200, gerekiyorsa DNS'i yönlendirin.
7. Özel anahtarı ve açık dump/tar dosyalarını güvenli silin; olayı (tarih, yedek adı, geçen süre, sonuç) kayda geçirin.

**Yalnız `guncelleme-oncesi` yedeğinden dönüş (uyumsuz migration sonrası):** `Stop-Service klinik-uygulama`; dump'ı yukarıdaki gibi **mevcut veritabanının yerine** yükleyin (`--clean --if-exists`); `guncel` bağlantısını eski sürüme çevirin (§10b); servisi başlatın. Yedekten sonraki yazımlar kaybolur — kullanıcılara bildirin.

**Denenmedi:** `pg_restore --clean` ile FORCE RLS / rol sahipliklerinin birebir geri geldiği ve `--no-owner --role` birleşiminin bu şemada sorunsuz çalıştığı doğrulanmadı; §12 prova planı bunu ilk kez kanıtlayacak.

## 12. Prova planı (üretim öncesi ZORUNLU)

**Koşum kaydı, ortam hazırlığı (Hyper-V + Windows Server 2022 deneme sürümü, checkpoint planı, indirme/çevrimdışı dosya listesi), A/B tur ayrımı ve hata günlüğü: `docs/prova-kayit.md`.**

Amaç: üretim sunucusuna dokunmadan, **temiz bir Windows makinesinde** (Hyper-V VM'si, Windows Sandbox ya da yerel PC; PowerShell yönetici) tüm zincirin çalıştığını kanıtlamak. Her adımda "beklenen" sütunu tutmuyorsa DUR, nedeni düzeltilmeden ilerlenmez; sonuç (tarih, adım, geçti/kaldı) kayda geçirilir. Prova makinesinde gerçek veri YOK; alan adı/sertifika gerektiren adımlar (Caddy HTTPS) yerelde `localhost` ile yapılır.

**Hazırlık (prova makinesine):** PostgreSQL 18 (EDB kurulumu, `postgres` parolası belirlenir), Node 22 LTS, Chrome/Edge. Paket: `gh release download` ya da CI artifact'ı; dosyalar `C:\klinik\ilk\` altında. (Windows Sandbox'ta her açılışta temiz başlar; `C:\klinik\ilk` paylaşımlı klasörden bağlanır.)

| # | Adım | Komut | Beklenen çıktı |
|---|---|---|---|
| 1 | Paket bütünlüğü + imza | `Get-FileHash -Algorithm SHA256 C:\klinik\ilk\klinik-<s1>.zip` ; `Get-Content …sha256` ; `minisign -V -m …zip -p klinik.pub -x …zip.minisig` | Özetler **birebir aynı**; minisign `Signature and comment signature verified` + `Trusted comment: klinik-<s1>`. `tar -xf … -C C:\klinik\ilk\paket` sorunsuz; `paket\server.js`, `paket\db\migrations`, `paket\deploy\windows` var. |
| 2 | Sunucu hazırlığı | `paket\deploy\windows\kurulum.ps1` (bakım/yedek hesap parolaları sorulur) | `PostgreSQL dogrulamasi TAMAM: yalniz localhost dinliyor…`; "Tum araclar mevcut" (eksikse listelenir); `C:\klinik\{gizli,surumler,indirme,log,dosya,yedek,caddy-veri}` oluşur; hata/`throw` YOK. Elle doğrula: `Get-NetTCPConnection -State Listen -LocalPort 5432` → yalnız `127.0.0.1` ve `::1`; `Get-Content <veri>\pg_hba.conf` → yalnız `127.0.0.1/32`, `::1/128` + son iki `reject` satırı, yöntem `scram-sha-256`; `postgresql.conf` sonunda `listen_addresses = 'localhost'`. |
| 3 | Veritabanı kurulumu | `$env:PGPASSWORD=<postgres>`; `KLINIK_*_SIFRE` (5 adet) ver; `paket\scripts\db-kur.ps1` | Sırayla `>> db/kurulum/00…03`, `>> db/migrations/0001…00NN`; sonda `bypassrls-kontrol: temiz`, `yetki-matrisi: temiz`, `N migration 'uygulandi' olarak kaydedildi.`, `Kurulum tamam.` Hata satırı YOK. Sonra `Remove-Item Env:PGPASSWORD`. |
| 4 | Kontrolleri ayrıca çalıştır | `psql -h localhost -U postgres -d klinik -f paket\db\kontrol\bypassrls-kontrol.sql` ; `… yetki-matrisi.sql` | `NOTICE: bypassrls-kontrol: temiz …`, `NOTICE: yetki-matrisi: temiz`; `HATA` satırı yok; `hba_zayif_yontem` UYARI satırı yok. `klinik_yedek` dışında BYPASSRLS rol yok. |
| 5 | Migration rolü | `deploy.env`'e `MIGRASYON_DATABASE_URL` yaz; `paket\deploy\windows\migrasyon-uygula.ps1 -Kontrol` | `Bekleyen migration yok.` (çıkış 0). `psql -U klinik_migrasyon -d klinik -c "select count(*) from hasta"` → `permission denied`. `select * from migrasyon.kayit` (SET ROLE klinik_sahip sonrası) → paketteki tüm dosyalar listelenir. |
| 6 | Gizli dosyalar + açık anahtar | `uygulama.env`, `bakim.env`, `yedek.env`, `deploy.env` oluştur (değerler prova değerleri; `uygulama.env`'e `GUNCELLEME_DURUM_DOSYASI=C:\klinik\durum\jeton.json`); `klinik.pub`'u `C:\klinik\anahtarlar\`'a kopyala (anahtar kimliğini geliştirici ile doğrula); `kurulum.ps1`'i tekrar çalıştır | `Izinler uygulandi: …`; `NT SERVICE` hesapları için "atlandi (henuz yok)" uyarısı normal. `runas /user:svc-klinik-bakim "cmd /c type C:\klinik\gizli\uygulama.env"` → **Erişim engellendi**. |
| 7 | İlk sürüm | `paket\deploy\windows\guncelle.ps1 -IlkKurulum -YerelPaket C:\klinik\ilk\klinik-<s1>.zip` (yanında `.sha256`, `.minisig`) | `SHA256 dogrulandi.` → `Imza dogrulandi (anahtar: klinik.pub).` → `On ucus tamam.` → `Bekleyen migration yok.` → `Ilk surum hazir: C:\klinik\surumler\<s1>-…`. `C:\klinik\guncel` junction'ı `SURUM.txt` ilk satırı `<s1>`. |
| 8 | Servisler | `C:\klinik\guncel\deploy\windows\servis-kur.ps1 -AlanAdi localhost` | `klinik-uygulama hesabi: NT SERVICE\klinik-uygulama`, `klinik-caddy hesabi: NT SERVICE\klinik-caddy`; `Saglik kontrolu: TAMAM`; `Caddy yonetim uc noktasi kapali`. `sc.exe qc klinik-uygulama` → `SERVICE_START_NAME : NT SERVICE\klinik-uygulama`. `Get-Service klinik-*` → Running. `curl http://127.0.0.1:3000/api/saglik` → `{"durum":"ok",…,"db":"ok"}` (200). Uygulama hesabı kodu değiştiremez: `icacls C:\klinik\guncel\server.js` → uygulama hesabı yalnız `(RX)`. |
| 9 | Uygulama duman testi | Tarayıcı `http://localhost`, klinik oluştur/giriş, PDF indir | Giriş çalışır, PDF üretilir, `/api/canli` bağlanır (canlı çizelge). |
| 10 | Yedek | `$env:...`/`yedek.env` hazır; `C:\klinik\guncel\deploy\windows\yedek.ps1` (svc-klinik-yedek ya da yönetici) | `Yedek tamam: <tarih>-gunluk`; `YEDEK_HEDEF_KLASOR`'de `.dump.age`, `.dosya.tar.age`, `.sha256`, ayın `…-aylik.*` kopyası; `.gecici` boş; dış kopya klasöründe aynı dosyalar. Çıkış 0, olay günlüğünde `Yedek tamam`. |
| 11 | Temiz veritabanına geri yükleme | Başka isimli boş küme/VM'de adım 2–3'ün **yalnız ilk üç SQL'i** (00/01/02), sonra `age -d … ; pg_restore --no-owner --role=klinik_sahip -d klinik --clean --if-exists klinik.dump` | `pg_restore` hata vermez (uyarı: yalnız "does not exist, skipping"). Satır sayıları kaynakla aynı; `migrasyon.kayit` dolu. |
| 12 | Kontroller yeniden | Adım 4'ün iki `.sql`'ini geri yüklenen veritabanında çalıştır | **Yine temiz.** FORCE RLS korunmuş: `select count(*) from hasta` (tenant bağlamsız, `klinik_uygulama` ile) → 0. Bozuk çıkarsa §11 "Denenmedi" maddesi gerçek sorundur → düzeltilir. |
| 13 | Yükseltme | Yeni etiket `<s2>` üret ve `scripts/yayin-imzala.ps1` ile imzala (içinde **en az bir yeni, geriye dönük uyumlu migration**); `guncelle.ps1 -YerelPaket …\klinik-<s2>.zip` (GitHub + jeton varsa `-YerelPaket`siz) | `SHA256 dogrulandi.` → `Imza dogrulandi` → `On ucus tamam.` → `Bekleyen migration var → guncelleme oncesi yedek aliniyor.` → `>> 00NN_….sql` → `1 migration uygulandi; yetki kontrolleri temiz.` → `Guncelleme basarili: <s2>`. `SURUM.txt` = `<s2>`; `/api/saglik` 200; `surumler\` altında iki sürüm; yedek klasöründe `…-guncelleme-oncesi.*`. |
| 14 | Bozuk özet reddi (imza geçerli olsa bile) | `.sha256` dosyasının bir karakterini değiştir, `guncelle.ps1 -YerelPaket … -Zorla` | `HATA (dogrulama): SHA256 UYUSMUYOR` , çıkış 1; `guncel` değişmedi; yeni klasör açılmadı. |
| 15 | Geri dönüş (otomatik) | Sağlıksız bir paket üret (örn. `uygulama.env`'de olmayan bir değişken isteyen ya da `/api/saglik`'i 503 yapan sürüm `<s3>`; ön uçuşu geçmesi için sağlık yalnız geçişten sonra bozulacak şekilde ya da ön uçuşu kapatarak `uygulama.env`'i geçici taşıyıp) ve `guncelle.ps1 -YerelPaket …<s3>` | Ön uçuş yakalarsa: `HATA (on-ucus)`, canlı değişmez, çıkış 1. Geçiş sonrası bozulursa: `HATA (gecis)` → `Onceki surume donuluyor` → `Geri donus basarili.`, çıkış 1; `SURUM.txt` yine `<s2>`; `/api/saglik` 200; olay günlüğünde `Error` kaydı. |
| 16 | Elle geri dönüş + eski şema | `guncelle.ps1 -Surum <s1>` GitHub ile ya da `-YerelPaket …<s1>` ile eski paket | Eski kod, yeni (genişletilmiş) şemada çalışır (`/api/saglik` 200, giriş çalışır) → geriye dönük uyum kuralının kanıtı. Çalışmazsa o migration kural dışıdır; §11 `guncelleme-oncesi` yedeğinden dönüş uygulanır ve adımı yeniden yazarsınız. |
| 17 | Servis dayanıklılığı | `Stop-Process -Name node -Force` (uygulama) ; 10 sn bekle | NSSM servisi yeniden başlatır; `/api/saglik` 200'e döner. Yedek hesabının `bakim.env`'i okuyamadığı doğrulanır. |
| 18 | İmzasız paket reddi | `.minisig` dosyasını sil (ya da imzasız bir zip + özet hazırla); `guncelle.ps1 -YerelPaket … -Zorla` | `HATA (yerel-paket): IMZA YOK … imzasiz paket REDDEDILDI` (GitHub yolunda: `HATA (indirme): IMZA YOK`), çıkış 1; `indirme\`de açılmış klasör YOK, `surumler\` değişmedi, `guncel` aynı; olay günlüğünde Error. |
| 19 | Bozuk / değiştirilmiş paket ve yanlış anahtar | (a) imzalı zip'in bir baytını değiştir **ve** `.sha256`'yı yeni özetle yeniden üret (SHA256'yı geçecek sahte paket); (b) geçerli bir paketi **başka** bir minisign anahtarıyla imzala | (a) `SHA256 dogrulandi.` geçer ama `HATA (imza): IMZA GECERSIZ … REDDEDILDI`; (b) aynı hata. Çıkış 1, olay **3501 Error**, paket açılmadı, canlı değişmedi. Bu adım SHA256'nın tek başına yetmediğini kanıtlar. |
| 20 | Eski sürüm imzası yeni sürüm gibi | `<s1>` paketinin zip + geçerli `.minisig`'ini `klinik-<s2>.zip` adıyla yeniden adlandırıp yerel paket olarak ver (özeti yeniden üret) | `HATA (imza): imzali yorum beklenenle (klinik-<s2>) uyusmuyor … reddedildi`. |
| 21 | Anahtar rotasyonu | Yeni minisign çifti üret; yeni `.pub`'u eskisinin yanına koy; bir paketi **yeni** anahtarla imzala → kabul; sonra eski `.pub`'u sil ve **eski** anahtarla imzalı paketi ver → reddedilir | Çift anahtarla her iki imza da kabul; eski `.pub` silinince eski anahtarla imzalı paket `IMZA: guvenilen yayin acik anahtari yok` ya da `IMZA GECERSIZ` ile reddedilir. |
| 22 | Jeton ömrü ve reddi | (a) `deploy.env`'de `GITHUB_TOKEN_SON_KULLANMA`'yı 7 gün sonrasına ayarla, GitHub yolunda `guncelle.ps1` çalıştır; (b) `GITHUB_DEPLOY_TOKEN`'ı bilerek bozuk yap ve çalıştır | (a) `UYARI: GitHub guncelleme jetonunun suresi 7 gun icinde doluyor`, olay **3010 Warning**, `durum\jeton.json` `sonKullanma` dolu, yerelde `/api/saglik` → `guncelleme_jetonu: "yaklasiyor"` + genel `durum: "uyari"` (HTTP 200), **dışarıdan (`X-Real-IP` ile) yalnız `{"durum":"uyari"}`**; (b) `HATA (surum-sorgu): JETON_REDDEDILDI …`, **çıkış kodu 3**, olay **3401 Error**, `jeton.json` `durum: reddedildi`, canlı sürüm değişmedi. Jetonu düzeltince bir sonraki çalışma `ok`a döner. |
| 23 | Görev hesapları | `kurulum.ps1` çıktısındaki parolayı not et; `secpol.msc`'de hakları incele; `runas /user:svc-klinik-bakim cmd` ve Uzak Masaüstü ile oturum açmayı dene; Task Scheduler görevini bu hesapla kaydet ve çalıştır | Parola yalnız kurulum ekranında göründü (diskte/logda YOK); `Toplu iş olarak oturum aç`: hesap VAR; `Yerel olarak oturum açmayı reddet` ve `Uzak Masaüstü ile oturum açmayı reddet`: hesap VAR; `runas`/RDP reddedilir; zamanlanmış görev (toplu iş) çalışır. `kurulum.ps1 -ParolaSifirla` yeni parola gösterir, eskisi geçersiz olur. |

**Prova tamam kriteri:** 1–23 geçti, sapmalar bu belgeye ve betiklere işlendi, tarih/ortam kaydedildi. Bu yapılmadan üretim kurulumuna geçilmez. Denenmeyen/geçmeyen her adım "denendi" diye işaretlenmez.

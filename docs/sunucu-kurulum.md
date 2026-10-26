# Sunucu Kurulumu (Windows Server VM) — İSKELET

Durum: tasarım. Henüz sunucu yok; adımlar Aşama 1'de uygulanıp düzeltilecek. **Gizli değer yazılmaz**, yalnız değişken adları.

## 1. Bileşenler
Node.js LTS · PostgreSQL (aynı VM, yalnız `localhost`) · NSSM (uygulama servisi) · Caddy (TLS, alan adı) · sistem Chrome/Edge (`CHROMIUM_PATH`) · Git (pull deploy) · `age` (yedek şifreleme, yalnız ortak anahtar tarafı).

## 2. Veritabanı rolleri

| Rol | Giriş | RLS | Yetki | Kullanan |
|---|---|---|---|---|
| `klinik_sahip` | hayır (`NOLOGIN`) | tabi (FORCE) | Tablo/fonksiyon sahibi; DDL | Migration bu rolle sahiplik atar (`scripts/db-kur.ps1`) |
| `klinik_uygulama` | evet | **tabi** | Yalnız gerekli `SELECT/INSERT/UPDATE/DELETE` ve `EXECUTE` | Uygulama (yalnız `DATABASE_URL`) |
| `klinik_anonim` | hayır (uygulama giriş öncesi akışlarda `SET LOCAL ROLE`) | **tabi** | Yalnız anonim akışların dar politikaları/fonksiyonları | QR, portal/personel giriş öncesi, iş başvurusu |
| **`bakim_rolu`** | evet | **tabi (BYPASSRLS DEĞİL)** | `klinik` üzerinde **yalnız SELECT**; bakım fonksiyonlarına EXECUTE; `klinik_uygulama` rolüne üyelik (`SET LOCAL ROLE klinik_uygulama` ile klinik başına iş `withTenant` altında yapılır) | **Yalnız** `scripts/` altındaki bakım betikleri (`BAKIM_DATABASE_URL`). Uygulama süreci bu bilgiyi hiç almaz |
| `klinik_yedek` | evet | **BYPASSRLS** (tek istisna) | Salt-okunur (`pg_read_all_data`) | Yalnız `yedek.ps1`. FORCE RLS altında `pg_dump` BYPASSRLS'siz çalışamaz; süper kullanıcı yerine bu dar rol seçildi. **Onay bekliyor** (plan, açık kararlar) |

Karar: bakim_rolu BYPASSRLS DEĞİL; bakım işi de RLS'ten geçer (klinik başına `app.tenant_id`). Böylece "sistem işi" bile başka kliniğin verisini bir transaction'da karıştıramaz. Sistem bağlamı RPC'lerde `session_user = 'bakim_rolu'` ile tanınır (bkz. `docs/service-role-siniflama.md`).

**Tüm tenant tablolarında `ALTER TABLE … FORCE ROW LEVEL SECURITY`.** Hiçbir fonksiyonun sahibi RLS'i atlayan bir rol olmaz; fonksiyonlar `klinik_sahip` sahipliğindedir. Doğrulama: `db/kontrol/bypassrls-kontrol.sql` (`scripts/db-kur.ps1` içinde çalışır). Tenant olmayan tablolar `docs/sema-esleme.md`'de listelenir.

## 3. Ortam değişkenleri ve gizli dosyalar (yalnız adlar)

`CRON_SECRET` **yoktur** (HTTP cron kalktı). Windows hesapları ve dosyalar:

| Windows hesabı | Ne çalıştırır | Okuyabildiği gizli dosya |
|---|---|---|
| `svc-klinik-uygulama` | NSSM servisi (Next.js) | `C:\klinik\gizli\uygulama.env` |
| `svc-klinik-bakim` | Task Scheduler görevleri (`scripts/*.mjs`) | `C:\klinik\gizli\bakim.env` |
| `svc-klinik-yedek` | `yedek.ps1` | `C:\klinik\gizli\yedek.env` |

**`uygulama.env`**: `DATABASE_URL` (klinik_uygulama) · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL` · `DOSYA_KOKU` · `CHROMIUM_PATH` · `MESAJ_MERKEZ_BASE_URL` · `MESAJ_MERKEZ_API_KEY` · `DESTEK_CHATBOT_ACIK` (varsayılan kapalı).
**`bakim.env`**: `BAKIM_DATABASE_URL` (bakim_rolu) · `MESAJ_MERKEZ_BASE_URL` · `MESAJ_MERKEZ_API_KEY` (kuyruk işçisi ve kredi senkronu için). **`DATABASE_URL` ve `BETTER_AUTH_SECRET` burada YOKTUR.**
**`yedek.env`**: `YEDEK_DATABASE_URL` (klinik_yedek) · `YEDEK_HEDEF_KLASOR` · `YEDEK_ALICI_ANAHTARI` (age ortak anahtarı) · `YEDEK_GUNLUK_SAKLAMA_GUN` (30) · `YEDEK_AYLIK_SAKLAMA_AY` (12) · `YEDEK_DIS_KOPYA_HEDEFI`.

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
Bu belge Aşama 1 (sunucu), Aşama 8 (yedek/sertleştirme) ve Aşama 9 (deploy) sırasında doldurulur; her komut denendikten sonra eklenir (denenmemiş komut yazılmaz).

# Sunucu Kurulumu (Windows Server VM) — İSKELET

Durum: tasarım. Henüz sunucu yok; adımlar Aşama 1'de uygulanıp düzeltilecek. **Gizli değer yazılmaz**, yalnız değişken adları.

## 1. Bileşenler
Node.js LTS · PostgreSQL (aynı VM, yalnız `localhost`) · NSSM (uygulama servisi) · Caddy (TLS, alan adı) · sistem Chrome/Edge (`CHROMIUM_PATH`) · Git (pull deploy) · `age` (yedek şifreleme, yalnız ortak anahtar tarafı).

## 2. Veritabanı rolleri

| Rol | Giriş | Yetki | Kullanan |
|---|---|---|---|
| `klinik_sahip` | hayır (`NOLOGIN`) | Tabloların/fonksiyonların sahibi | Migration'ın sahiplik atadığı rol |
| `klinik_uygulama` | evet | `NOBYPASSRLS`, sahip DEĞİL; yalnız gerekli `SELECT/INSERT/UPDATE/DELETE`/`EXECUTE` | Uygulama (yalnız `DATABASE_URL`) |
| `klinik_anonim` | hayır (uygulama `SET LOCAL ROLE` ile geçer — Aşama 2'de netleşir) | Yalnız anonim akışların dar politikaları | QR/portal giriş/başvuru formları |
| **`bakim_rolu`** | evet | `BYPASSRLS` + migration/bakım yetkisi | **Yalnız** migration ve DB bakım betikleri (`BAKIM_DATABASE_URL`). Uygulama süreci bu bağlantı bilgisini ASLA almaz |
| `klinik_yedek` | evet | `pg_dump` için salt-okunur (`pg_read_all_data`) + `BYPASSRLS` (dump'ın tüm satırı görmesi için) | Yalnız `yedek.ps1` |

**Tüm tenant tablolarında `ALTER TABLE … FORCE ROW LEVEL SECURITY`** (sahip dahil herkes RLS'e tabi). FORCE'ta RLS'i yalnız `BYPASSRLS` özniteliği atlar; bu yüzden `bakim_rolu` ve `klinik_yedek` bu öznitelikle tanımlanır, başka kimseye verilmez. Tenant tablosu olmayanlar (ör. `resmi_tatil`, `resmi_tatil_oneri`, `hiz_siniri_sayac`, `klinik`) tek tek listelenip istisna olarak gerekçelendirilir.

## 3. Ortam değişkenleri (yalnız adlar)
`DATABASE_URL` · `BAKIM_DATABASE_URL` (uygulamada tanımlı OLMAZ) · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL` · `CRON_SECRET` · `DOSYA_KOKU` · `CHROMIUM_PATH` · `MESAJ_MERKEZ_BASE_URL` · `MESAJ_MERKEZ_API_KEY` · `DESTEK_CHATBOT_ACIK` (varsayılan kapalı) · `YEDEK_HEDEF_KLASOR` · `YEDEK_ALICI_ANAHTARI` (age **ortak** anahtarı) · `YEDEK_GUNLUK_SAKLAMA_GUN` (varsayılan 30) · `YEDEK_AYLIK_SAKLAMA_AY` (varsayılan 12) · `YEDEK_DIS_KOPYA_HEDEFI`.
Servis ortam değişkenleri yalnız servis hesabının okuyabildiği NSSM ayarında tutulur; repoya/loglara yazılmaz.

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
7. Sunucu **dışına** kopya: sunucudan dışarı bağlanarak (push) `YEDEK_DIS_KOPYA_HEDEFI`'ne; hedef Türkiye içinde olmalı (KVKK; yer netleşmedi).
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

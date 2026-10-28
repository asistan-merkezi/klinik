# Güvenlik Taban Çizgisi (Aşama 7a)

Tarih: 2026-10-28 · Dal: `tasima/windows-postgres` · Kapsam: uygulama katmanı (Next.js + Caddy + dosya deposu + günlükler). Veritabanı/rol/RLS katmanı: `docs/platform-katmani.md`, `docs/yetki-matrisi.md`, `docs/definer-siniflama.md`.

Yöntem: önce MEVCUT durum denetlendi, eksikler kapatıldı, her madde teste bağlandı. (`anthropic-skills:security-baseline` skill'i bu ortamda yüklenemedi — "Unknown skill"; denetim isteğin yedi maddesine göre yapıldı.)

Testler: birim `lib/guvenlik/guvenlik.test.ts` · gerçek Postgres `tests/db/guvenlik-baseline.test.ts`, `tests/db/modul-terapist-finans.test.ts` · tarayıcı `tests/e2e/guvenlik.spec.ts`.

## 1. Hız sınırı (sunucu içi, DB tabanlı `hiz_siniri_kullan`, FAIL-CLOSED)

| Uç | Anahtar / sınır | Durum | Test |
|---|---|---|---|
| Personel/portal girişi | hesap başına 15 dk'da 5 hatalı + IP başına 30 (`lib/auth/giris.ts`) | mevcut | `kimlik.test.ts` ("5 hatalı…", "sayaç erişilemezse…") |
| Şifremi unuttum / sıfırla / değiştir | hesap 3/sa, IP 10/sa; sıfırla IP 20/15 dk (`sifre-islemleri.ts`) | mevcut | `kimlik.test.ts` |
| `/b/[token]` bağlantıları | IP başına 30 / 10 dk (`baglanti-coz.ts`) | mevcut (Modül 7) | `modul-mesaj-bakim.test.ts` |
| QR / anonim uçlar (kayıt, anket, iş başvurusu, logo) | IP + kısa kod, günlük kod sınırı (`anonim-uc.ts`) | mevcut | `anonim-ve-yazma.test.ts` |
| **PDF** (3 route) | kullanıcı başına 30 / 10 dk + semafor (2 eşzamanlı) | **eklendi** | birim + DB (`SINIRLAR` döngüsü) |
| **Dosya yükleme** (foto/belge, izin belgesi, kaşe, logo) | kullanıcı (kaşe/logo: klinik) başına 60 / 10 dk | **eklendi** | DB |
| **Dosya görüntüleme** (hasta belgesi, izin belgesi, kaşe) | kullanıcı başına 600 / 10 dk | **eklendi** | DB |
| **Hasta arama** (canlı arama) | kullanıcı başına 240 / dk | **eklendi** | DB (route 429 + Retry-After) |
| **Destek bağlamı açma** (super_admin) | kullanıcı başına 10 / sa | **eklendi** | DB |
| **Destek chatbotu** | kullanıcı başına 60 / 10 dk (bayrak kapalıyken zaten 404) | **eklendi** | DB |

Sayaç okunamaz/yazılamazsa istek REDDEDİLİR (503): `guvenlik.test.ts > hız sınırı: FAIL-CLOSED`. Tek kaynak: `lib/guvenlik/istek-siniri.ts > SINIRLAR`. IP kaynağı yalnız Caddy'nin ayarladığı `X-Real-IP`.

## 2. Girdi doğrulama

Tarama (`guvenlik.test.ts > uç taraması`): her `"use server"` dosyası ve her `route.ts` ya doğrulama kullanır (zod / `uuidZorunlu` / `*Semasi`) ya da gerekçeli istisna listesindedir; **yeni doğrulamasız uç eklenirse test kırılır**.

| Bulgu | Karar |
|---|---|
| Giriş/portal giriş/şifre değiştir/sıfırla/unuttum eylemleri `String(formData.get())` ile doğrulamasızdı (uzunluk sınırı yok → devasa gövdeyle argon2/DB zorlanabilirdi) | **eklendi**: zod şemaları (`lib/guvenlik/girdi.ts`), parola ≤128, ad ≤254; geçersizde genel mesaj |
| Hasta/randevu okuma eylemleri (≈37 fonksiyon) kimlik parametresini DB'ye doğrulamadan gönderiyordu (22P02 hatası) | **eklendi**: `uuidZorunlu` (`GecersizGirdi`, iç ayrıntı yok) |
| Arşiv içe aktarma (4 eylem) sınırsız boyutta JSON kabul ediyordu | **eklendi**: parça başına ≤500 satır, ≤60 alan, alan ≤1000 karakter; telefon listesi ≤5000 |
| Mesaj ayarları: `kanal` ve kural alanları çalışma zamanında doğrulanmıyordu | **eklendi**: zod |
| İstisna listesindeki 17 uç (girdisiz çıkış/sağlık, beyaz listeli `canli`, UUID regex'li belge route'ları, Better Auth, `/b/`…) | gerekçeleri testte yazılı |

## 3. Başlıklar — kim neyi koyar

| Başlık | Nerede | Not |
|---|---|---|
| `Strict-Transport-Security` (**1 hafta**, includeSubDomains/preload YOK; kademeli artış: `docs/sunucu-kurulum.md` §3d) | **Caddy** | TLS Caddy'de sonlanır; uygulamada YOK (yerel http'de anlamsız) |
| `Content-Security-Policy` (nonce + `strict-dynamic`) | **`proxy.ts`** (`lib/guvenlik/csp.ts`) | nonce istek başına üretilir; bu yüzden `app/(app)` ve `app/(marketing)` layout'ları `force-dynamic`. API ve `/b/` yanıtlarına eklenmez (belge route'ları kendi `sandbox` CSP'sini taşır) |
| `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` | **`next.config.ts`** (her yol) **ve Caddy** (derinlemesine savunma) | tek kaynak `ORTAK_BASLIKLAR` |
| `frame-ancestors 'none'` | CSP | X-Frame-Options ile birlikte |
| `X-Powered-By`, `Server` | Next `poweredByHeader:false`; Caddy `-Server -X-Powered-By` | |
| İstek gövdesi sınırı | **Caddy**: yükleme yolu 60 MB (uygulama sınırı 50 MB), diğer her yol 25 MB | **bulundu**: önceki 25 MB genel sınır, uygulamanın 50 MB'lık geçerli dosyasını proxy'de 413'e çeviriyordu |
| CORS | **hiç yok** | uygulama `Access-Control-*` başlığı üretmez (testle sabitlendi); API'ler yalnız aynı köken çerezi kullanır |

CSP ayrıntıları: betik yalnız nonce'lu (`unsafe-inline`/`unsafe-eval` YOK; `unsafe-eval` yalnız geliştirmede). `style-src 'unsafe-inline'` BİLİNÇLİ (React `style=` öznitelikleri ve konumlandırma kütüphaneleri nonce taşıyamaz; stil enjeksiyonu betik çalıştırmaz). Dış kaynak yok (`default-src 'self'`, yazı tipleri build'de self-host). Tarayıcıda doğrulandı: dev'de giriş sayfaları + giriş sonrası yönetici/terapist panelleri ve **üretim derlemesinde** (`next start`) 4 sayfa — CSP ihlali 0 (`guvenlik.spec.ts`; üretim denemesi elle).

## 4. Dosya yükleme

| Kontrol | Durum |
|---|---|
| MIME beyaz listesi (JPEG/PNG/WebP/PDF; logo +SVG) ve **dosya imzası** (magic number) bildirilen türle eşleşmeli | mevcut (`lib/dosya/imza.ts`); testle sabitlendi |
| Uzantı MIME'dan türetilir (kullanıcı adı kullanılmaz) | mevcut |
| Boyut sınırı (belge 50 MB, izin belgesi 10 MB, kaşe 5 MB, logo 2 MB) + Caddy gövde sınırı uyumu | mevcut + **Caddy uyumsuzluğu düzeltildi** (test: yükleme sınırı > uygulama sınırı) |
| UUID/rastgele ad, yol sunucuda üretilir, `..`/mutlak yol reddedilir, web kökü dışı depo | mevcut (`lib/dosya/depo.ts`, `personel-belge.ts`) |
| İndirme: `Content-Type` sabit, `nosniff`, `Content-Security-Policy: sandbox`, `private, no-store` | mevcut |
| **SVG logo denetimi zayıftı** (yalnız 4 desen; `onclick=`, `<iframe>`, dış `href` geçiyordu) | **düzeltildi**: `svgGuvenliMi` (olay işleyicisi, gömülü içerik, XXE, `#` dışı href yasak); ayrıca sandbox CSP ile servis |
| Yükleme hız sınırı | **eklendi** (madde 1) |
| Virüs taraması | **YOK** (kalan açık) |

## 5. Log hijyeni

| Kontrol | Durum |
|---|---|
| Sunucu günlükleri: `console.*` `instrumentation.ts` ile sarıldı; `/b/` belirteci, Bearer/Authorization/Cookie, `token/şifre/secret/api_key` değerleri, bağlantı dizesi parolası, `re_` anahtarı, IBAN, kart, TC, telefon, e-posta silinir; UUID ve zaman damgası KORUNUR | **eklendi** (`lib/guvenlik/log-temizle.ts`) |
| Bakım betikleri JSON günlüğü aynı temizleyiciden geçer | **eklendi** |
| **Caddy erişim günlüğü** (`caddy-erisim.log`) URL'deki `/b/<token>`, `?token=` (şifre sıfırlama), `/reset-password/<token>` ve Cookie/Authorization/Set-Cookie başlıklarını dosyaya yazıyordu | **düzeltildi**: `format filter` (test: regex çıktısı; **Caddy ile gerçek doğrulanmadı**) |
| Hata mesajları istemciye iç ayrıntı sızdırmaz: route'larda istisna mesajı/stack gövdeye yazılmaz (kaynak taraması), eylemler genel Türkçe mesaj döner, Next üretimde sunucu hatalarını `digest`e indirger, `productionBrowserSourceMaps:false` | mevcut + testle sabitlendi |
| Sağlık notu / ad-soyad | desenle YAKALANAMAZ → kural: log mesajına hiç konmaz (kod incelemesi); **otomatik koruma yok** |

## 6. Çerez, oturum, CSRF

| Kontrol | Durum / test |
|---|---|
| Oturum çerezi `klinik.session_token`: httpOnly, SameSite=Lax, Secure (üretim); cihaz çerezi aynı öznitelikler (400 gün) | mevcut; `guvenlik.test.ts` (üretim ayarı) + e2e (httpOnly/sameSite) |
| Süre: oturum 12 sa (`updateAge` 1 sa), `cookieCache` kapalı → iptal/devre dışı anında etkili | mevcut; `kimlik.test.ts` ("devre dışı bırakılınca açık oturum HEMEN düşer"), SSE her ping'de doğrular |
| İptal: şifre değişimi/sıfırlama diğer oturumları siler; resepsiyon geçici şifresi eski oturumları siler; gece zorunlu çıkış | mevcut; `kimlik.test.ts` |
| Kayıt kapalı (`disableSignUp`), sıfırlama jetonu tek kullanımlık 30 dk | mevcut |
| **CSRF — server action**: Next, `Origin` ↔ `Host/X-Forwarded-Host` karşılaştırır; `allowedOrigins` tanımlı DEĞİL | mevcut; **e2e kanıtı eklendi**: gerçek bir eylem isteği farklı Origin/porttla tekrarlanınca 200 DEĞİL, aynı Origin'le 200 |
| **CSRF — route handler POST** (`foto-yukle`, `destek-chatbot`) | **eklendi**: `ayniKokenMi` (Origin + `Sec-Fetch-Site`), DB testi 403 |
| CSRF — Better Auth `/api/auth/*` | kütüphanenin köken denetimi; e2e: farklı Origin'li giriş isteği çerez üretmez |
| SameSite=Lax | üst düzey çapraz-site POST'ta çerez gitmez (ikinci katman) |

## 7. Bulunan eksikler (bu turda kapatılanlar)

1. Caddy erişim günlüğü belirteçleri ve çerezleri yazıyordu.
2. Caddy 25 MB genel gövde sınırı, uygulamanın 50 MB belge sınırıyla çelişiyordu (geçerli yükleme 413).
3. SVG logo kara listesi atlatılabilirdi.
4. Kimlik formlarında uzunluk sınırı yoktu; arşiv içe aktarma sınırsızdı.
5. PDF, yükleme, arama, destek bağlamı ve chatbot uçlarında hız sınırı yoktu.
6. Route handler POST'larında köken denetimi yoktu; uygulama `X-Powered-By` gönderiyordu.
7. CSP hiç yoktu.
8. `console.*` günlükleri temizlenmiyordu.
9. Terapist finans tablolarını okuyabiliyordu → Modül 4c (aşağıdaki not).

**Modül 4c (migration 0017)**: `hasta_bakiye_hareket`, `odeme`, `odeme_kalemi`, `odeme_satiri`, `fatura`, `paket_satis` SELECT politikaları `klinik_admin/resepsiyon/muhasebe`'ye daraltıldı; terapist için DAR görünümler `v_randevu_kapanis` (işlendi/kapanış şekli/paket kalanı-adı), `v_hasta_paket_ozet`, `v_hasta_aktif_paket` (tutar YOK). `db/kontrol/bypassrls-kontrol.sql` 6f bu kuralı denetler (mutasyon kanıtlı). Ayrıntı: `docs/modul-4b-4c-tasarim.md`.

## 8. Kalan açıklar (dürüst liste)

| # | Açık | Risk / not |
|---|---|---|
| 1 | **`next` 16.3.8 için `npm audit` KRİTİK**; düzeltme 16.4.3 (proje sürümü bilinçli sabit) | **canlıdan önce karar**: sürüm yükseltme + tam test. Ayrıca yüksek: `puppeteer-core`/`chromium-bidi`/`zod` (puppeteer'ın iç bağımlılığı), `undici`, `vite`/`vitest` (yalnız geliştirme); orta: `exceljs`/`uuid`, `drizzle-kit`/`esbuild` (geliştirme) |
| 2 | CSP `style-src 'unsafe-inline'` | betik çalıştırmaz ama stil enjeksiyonuyla veri sızdırma (CSS exfiltration) teorik; nonce'lu stil için kütüphane değişikliği gerekir |
| 3 | CSP üretimde **Report-Only ile gözlemlenmedi** (rapor ucu yok); tarayıcıda yalnız 4 genel + 3 panel sayfası denendi — tablet, PDF önizleme, QR sayfaları, kamera yükleme ve canlı Edge dışı tarayıcılar denenmedi | canlıda önce `Content-Security-Policy-Report-Only` ile bir hafta izlenmesi önerilir |
| 4 | Server action CSRF korumasının tek dayanağı Next'in Origin denetimi + SameSite=Lax; ters vekilde `Host`/`X-Forwarded-Host` yanlış iletilirse davranış değişir | Caddy `reverse_proxy` varsayılanı doğru; sunucuda e2e tekrar edilmeli (prova) |
| 5 | Caddy `format filter`/`request_body @matcher` sözdizimi bu makinede **Caddy ile doğrulanmadı** (Caddy kurulu değil) | prova adımı: `caddy validate`; sonra günlükte token görünmediği elle kontrol |
| 6 | Dosya yüklemede virüs/zararlı içerik taraması yok; PDF içeriği (gömülü betik) ayrıştırılmıyor | belgeler `sandbox` CSP ve `nosniff` ile servis edilir, indirilen PDF istemcide açılır |
| 7 | Hız sınırı IP'si `X-Real-IP`; Cloudflare proxy açılırsa gerçek IP için `trusted_proxies` ayarı şart (`Caddyfile` notu) | proxy kapalı kalmalı (KVKK) |
| 8 | Sağlık notu / ad-soyad log'dan otomatik ayıklanamaz | kod incelemesi kuralı; `console.error(hata)` ile ham veritabanı hata nesnesi yazarken parametre değerleri hata mesajında geçebilir — temizleyici desenlere bakar (TC/telefon/e-posta/IBAN), serbest metne bakmaz |
| 9 | `unsafe-eval` geliştirmede açık (Next gereği) | üretim derlemesinde kapalı, doğrulandı |
| 10 | Hasta belge küçük resim listeleri çok görselli sayfada 600/10 dk'yı aşabilir | aşılırsa 429; gerçek kullanımda izlenmeli |
| 11 | Oturum çözümleme Better Auth `getSession` + DB; `app.user_id` güvencesi (Seçenek B) hâlâ açık üretim kapısı | `docs/tasima-plani.md` #1 |

## 9. Üçüncü tur eklemeleri (2026-10-28) ve ek açık maddeler

**Yapıldı:** kritik giriş/şifre/kimlik/finans yazma/destek bağlamı/izin talebi şemaları `z.strictObject` (fazla alan reddedilir; test: `guvenlik.test.ts > strict şemalar`, kaynakta gevşek `z.object` kalmadığını da denetler); dosya yüklemede bilinmeyen form alanı 400; **HSTS 1 hafta, kademeli artış** (`docs/sunucu-kurulum.md` §3d; HSTS yalnız Caddy'de — gerekçe orada); hız sınırı aşımı olayı JSON satırı (`olay, uc, kimlik_hash(8), zaman`) olarak loglanır ve günlük hijyen sarmalayıcısından geçer; istemci IP'si yalnız `X-Real-IP` (Caddy `istemci_ip` parçası bunu ve `X-Forwarded-For`'u ezer, `Forwarded`/`X-Client-IP`/`True-Client-IP`/`CF-Connecting-IP` siler; uygulama XFF'yi artık HİÇ okumaz, başlık yoksa tek ortak kova) — testler: birim + gerçek sayaçla sahte başlıklarla limit atlatılamaz.

**Açık maddeler (ek):**

| # | Açık | Öncelik / not |
|---|---|---|
| 12 | **Oturumlu uçlarda genel IP bazlı limit yok.** Oturumlu uçlarda yalnız kullanıcı başına limit var (giriş ve anonim uçlarda IP limiti zaten var). Çalınmış tek oturumun kullanıcı limitini aşmadan yaptığı tarama veya çok sayıda hesapla dağıtık istek IP limitine takılmaz | düşük (kimlik doğrulanmış, tenant'a bağlı; dağıtık kötüye kullanım için ileride Caddy/WAF seviyesinde genel IP limiti) |
| 13 | **Destek chatbotu AÇILMADAN önce** (varsayılan kapalı, `DESTEK_CHATBOT_ACIK`): (a) kullanıcı metni sistem talimatından AYRI bir blokta (delimiter/XML etiketi) modele verilmeli — şimdi `streamText` mesaj listesine ekliyor, talimatla aynı düzlemde birleştirmiyor ama ayrı blok sözleşmesi yok; (b) model çıktısı güvensiz sayılmalı: istemcide metin olarak render (HTML değil), araç/komut çalıştırma yok, çıktı bir yapıya dönüşecekse zod ile parse; (c) kişisel veri modele gitmemeli — şimdiki maskeleme yalnız TC/IBAN/kart/telefon/e-posta desenlerini yakalar, ad-soyad ve sağlık metnini YAKALAYAMAZ; açmadan önce kullanım uyarısı + mümkünse sunucuda hasta adı sözlüğüyle maskeleme; (d) **hukuk/KVKK onayı** (yurt dışı LLM); (e) kullanıcı başına limit zaten var (`chatbot` 60/10 dk), maliyet tavanı ayrıca izlenmeli | açmadan önce zorunlu |
| 14 | **Skill varsayımları:** `security-baseline` skill'i Next.js + Supabase + Vercel + Upstash varsayar. Bu projede karşılıkları: Upstash/Vercel WAF yerine **DB tabanlı fail-closed sayaç** (`hiz_siniri_kullan`, Caddy gövde sınırı); Supabase RLS yerine **PostgreSQL FORCE RLS + `withTenant`** (`docs/platform-katmani.md`); `next.config.js` başlıklarının bir kısmı **Caddy**'de (HSTS, sunucu bilgisi gizleme) çünkü TLS orada sonlanır; Vercel ortam değişkeni kuralı (`NEXT_PUBLIC_`) bu projede istemciye giden hiçbir sır olmadığı için tarama testiyle değil kod incelemesiyle sağlanıyor | bilgi (eksik değil, eşleme) |

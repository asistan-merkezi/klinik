# Platform Katmanı Kullanım Kılavuzu (veritabanı + kimlik)

Bu katman Klinik Asistanı'nda yazıldı ama **Asistan Merkezi çatısı altındaki diğer projeler de aynı kalıbı kullanacak** (tek Windows VM + düz Postgres + RLS + Better Auth). Bu belge hem bu projede nasıl kullanılacağını hem diğer projeye nasıl taşınacağını anlatır. Tarih: 2026-10-27 · Dal: `tasima/windows-postgres`.

## 1. Mimari (tek bakışta)

```
İstek ──► proxy.ts ──► oturum (Better Auth, DB) ──► sayfa / server action / route handler
                                                         │  getSessionContext()  → { userId, tenantId, rol }   (tenant istemciden ASLA alınmaz)
                                                         ▼
                                  withTenant({userId, tenantId}, tx => ...)      BEGIN; set_config(app.user_id, app.tenant_id, local)
                                                         ▼
                              Postgres (RLS FORCE, rol klinik_uygulama) ── yalnız kendi kliniğinin satırı
Kimlik tabloları (kimlik_kullanici, oturum, kimlik_hesap, kimlik_dogrulama) ── YALNIZ kimlik_rolu havuzu (Better Auth + lib/auth)
Bakım betikleri (Task Scheduler) ── bakim_rolu: klinik listesi → klinik başına SET LOCAL ROLE klinik_uygulama + tenant
Giriş öncesi (anonim) ── tanima şeması (kısa kod → klinik) → withAnonim(tenant) → politikalar (QR açık mı + klinik eşleşmesi)
```

İKİ AYRI BAĞLANTI HAVUZU: `klinik_uygulama` (`DATABASE_URL`) tenant verisi, `kimlik_rolu` (`KIMLIK_DATABASE_URL`) kimlik. Birinin ele geçirilmesi diğerinin verisini açmaz. Bakım betikleri üçüncü bağlantıyı (`BAKIM_DATABASE_URL`, yalnız `bakim.env`) kullanır; Next.js süreci bunu görmez.

## 2. Ortam değişkenleri (yalnız adlar; değerler `docs/sunucu-kurulum.md` gizli dosyalarında)
`DATABASE_URL` · `KIMLIK_DATABASE_URL` · `BAKIM_DATABASE_URL` (yalnız betikler) · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL` · isteğe bağlı: `DB_HAVUZ_MAKS` (10), `DB_KIMLIK_HAVUZ_MAKS` (5), `OTURUM_SURESI_SN` (43200), `KLINIK_AUTH_NEXT_COOKIES=0` (yalnız testlerde).

## 3. `lib/db` — tek giriş kapısı

```ts
import { withTenant, withKullanici, withAnonim, withGlobal, withTanima, sema } from "@/lib/db";
```

| Sarmalayıcı | Ne zaman | Bağlam |
|---|---|---|
| `withTenant({ userId, tenantId }, tx => …)` | Oturumlu kullanıcının tenant verisi (varsayılan) | `app.user_id` + `app.tenant_id`, rol `klinik_uygulama` |
| `withKullanici(userId, tx => …)` | Tenant henüz bilinmiyor (oturum çözümleme) | yalnız `app.user_id`; kullanıcının KENDİ satırı görünür |
| `withAnonim({ tenantId }, tx => …)` | Giriş öncesi yazma | `app.tenant_id` + `SET LOCAL ROLE klinik_anonim` |
| `withTanima(tx => …)` | Kısa kod/randevu → klinik çözümleme | bağlam yok, rol `klinik_anonim`, yalnız `tanima.*` fonksiyonları |
| `withGlobal(tx => …)` | Tenant'sız global fonksiyon (`hiz_siniri_kullan`) | bağlam yok; tenant tablolarından 0 satır |

**Damgalı bağlam (Aşama 4):** `withTenant`/`withKullanici`/`withAnonim` düz `{ userId, tenantId }` nesnesi KABUL ETMEZ; yalnız `lib/db/baglam-uretici.ts` üreticilerinin damgaladığı nesneleri alır (tip markası + çalışma zamanı WeakSet + dondurulmuş nesne). Üreticileri yalnız `getSessionContext()` (`tenantGerekli(ctx)` ile) ve tanima çözümleyicisi (`anonim-uc.ts`) import edebilir; başka dosyada ESLint hata verir. Sayfa/eylemlerde bağlam şöyle alınır: `const y = await eylemYetkisi([...])` (`lib/auth/yetki.ts`) → `y.bag`; sayfada `oturumBaglami()` + `tenantGerekli(ctx)`.

**Dosyalar:** `lib/dosya/depo.ts` (DOSYA_KOKU, yol doğrulama, atomik yazım) + `lib/dosya/logo.ts`; logo `/api/dosya/logo` (oturumlu) ve `/api/logo/[kisaKod]` (giriş öncesi) route'larından servis edilir. **Gece zorunlu çıkış** (resepsiyon/terapist, 20:00–07:00 her tam saat) sunucu tarafında `lib/auth/gece-kapanis.ts` ile `getSessionContext` içinde uygulanır.

Kurallar:
- Her sarmalayıcı **bir transaction**'dır ve bağlamı `set_config(…, true)` (=`SET LOCAL`) ile verir: bağlam transaction bitince kaybolur, havuzdaki sonraki isteğe sızmaz (test: `tests/db/izolasyon.test.ts`). `userId`/`tenantId` UUID biçimi doğrulanır (enjeksiyon/boş değer reddedilir).
- **ESLint `no-restricted-imports`** uygulama kodunda `pg`, `drizzle-orm/node-postgres` ve `lib/db/havuz-*`, `lib/db/bakim`, `lib/db/baglam` import'unu YASAKLAR (yalnız `lib/db`, `lib/auth`, `scripts/dev`, `db/kontrol`, `tests/db` muaf; `lib/auth` yalnız kimlik havuzunu kullanabilir). `tx`, `lib/db`'den dışarı yalnız callback parametresi olarak çıkar; havuz hiç dışarı çıkmaz.
- Şema: `lib/db/sema/schema.ts` + `relations.ts` **üretilmiştir** (`node scripts/dev/drizzle-cek.mjs`, drizzle-kit pull + `sema-duzelt.mjs`); elle düzenleme. Şema değişikliği = yeni `db/migrations/00xx_*.sql` → `drizzle-cek.mjs`.
- Sorgu yazarken `tx.select().from(sema.hasta)…`; çok tablolu atomik işlemler yine **RPC** (CLAUDE.md kuralı): `tx.execute(sql\`select odeme_olustur(${…})\`)`.

Örnek (server action):
```ts
"use server";
import { requireSession } from "@/lib/auth/next";
import { rolGerekli, tenantGerekli } from "@/lib/auth";
import { withTenant, sema } from "@/lib/db";

export async function hastalariListele() {
  const ctx = await requireSession();                  // yoksa OturumHatasi(401)
  rolGerekli(ctx, ["klinik_admin", "resepsiyon"]);     // yetkisizse 403 (super_admin her kümeyi geçer)
  return withTenant(tenantGerekli(ctx), (tx) => tx.select().from(sema.hasta));   // RLS: yalnız bu klinik
}
```

### Bakım betikleri (Task Scheduler → `scripts/*.mjs`)
```ts
import { bakimKlinikleriniDolas } from "@/lib/db/bakim";   // BAKIM_DATABASE_URL (bakim_rolu)
const sonuclar = await bakimKlinikleriniDolas(async (tx, klinik) => { /* bu klinikte iş (RLS'e tabi) */ });
// her klinik ayrı transaction: bakim_rolu → SET LOCAL ROLE klinik_uygulama + app.tenant_id. Hata bir kliniği durdurur, diğerlerini değil.
```
`bakim_rolu` BYPASSRLS değildir; yalnız `klinik(id, ad)` okur ve bakım fonksiyonlarını (`audit_log_bolum_olustur`) çağırır. HTTP cron route'u YOKTUR.

## 4. `lib/auth` — kimlik (Better Auth 1.7.14)

### Roller ve oturum bağlamı
- `getSessionContext(headers)` / `requireSessionContext(headers)` (`lib/auth/oturum.ts`); Next içinde `getSessionContext()` / `requireSession()` (`lib/auth/next.ts`, `headers()` okur). Döner: `{ userId, tenantId, rol, tur, hastaId, eposta, sifreDegistirmeli, cihazKimligi }`.
- **Tenant ve rol istemciden alınmaz**: personelde `kullanici` satırından (`withKullanici`, yalnız kendi satırı), hastada `kimlik_kullanici.klinik_id` + `hasta_kullanici.aktif` doğrulamasıyla. İstemci başlıkları (`x-tenant-id` vb.) yok sayılır (test).
- Roller: `super_admin` (tenantId = null), `klinik_admin`, `resepsiyon`, `terapist`, `muhasebe`, `hasta` (portal). `rolGerekli(ctx, [...])` 403; `tenantGerekli(ctx)` super_admin gibi bağlamsız oturumlarda 403. Route handler'da `yanitaCevir(e)` 401/403 JSON üretir.
- Panel/portal ayrımı proxy'de (`lib/auth/proxy-karari.ts`, saf ve test'li): hasta `/panel`e, personel `/portal`a giremez.

### Giriş (Seçenek D) — `lib/auth/giris.ts`
- **Personel/admin**: e-posta+parola. Yalnız `klinik_admin`/`super_admin` e-postayla girer; diğer roller **telefon**+parola (admin telefonla girmez). Telefon→e-posta çevirimi `kimlik_rolu` ile dar bir sorgudur (`telefon_norm` + `telefonla_giris`); anonim DEFINER RPC yoktur.
- **Hasta portalı**: (klinik kısa kodu, telefon) + parola. Klinik `tanima.klinik_qr_bilgisi_getir` ile çözülür; adres kliniğe özeldir (`/portal/[klinikKodu]/giris`). Hasta telefonu klinikler arası tekil olmak zorunda değildir: `(klinik_id, telefon_norm)` tekildir; personel telefonu global tekildir (`0005`).
- OTP/SMS kodu YOK. Hata mesajları ortaktır (yanlış şifre = bilinmeyen hesap = devre dışı = yanlış klinik); bilinmeyen hesapta zamanlama eşitleme için sahte argon2 doğrulaması yapılır. Kural ihlali mesajları ("telefonla girin") yalnız DOĞRU şifreden sonra söylenir.
- Çıktı: `GirisSonucu` = `{ ok, sifreDegistirmeli, tur, kullaniciId, cerezler }` veya `{ ok:false, kod, mesaj }`. Server action `redirect`'i yapar: `sifreDegistirmeli ? "/sifre-degistir" : donus` (`?donus=` yalnız `guvenliDonusAdresi` ile).

### Hesap yaşam döngüsü — `lib/auth/hesap.ts` (iki havuz = iki transaction!)
```ts
// 1) önce kimlik, 2) sonra tenant satırı; tenant yazımı düşerse kimlik geri alınır
const hesap = await personelHesabiOlustur({ eposta, ad, telefon, rol, klinikId });   // geçici şifre: hesap.geciciSifre (bir kez gösterilir)
try {
  await withTenant({ userId: yoneticiId, tenantId }, (tx) => tx.insert(sema.kullanici).values({ id: hesap.id, klinikId, rol, adSoyad: ad, telefon }));
} catch (e) { await kimlikHesabiSil(hesap.id); throw e; }
```
- `hastaHesabiOlustur` (7 gün geçici şifre, ilk girişte değiştirme zorunlu), `geciciSifreYenile` (resepsiyon; eski oturumlar iptal), `hesabiDevreDisiBirak` (işten çıkış: `devre_disi` + **açık oturumların silinmesi**, cookie cache kapalı olduğundan anında etkili), `hesabiYenidenEtkinlestir`, `kimlikBilgisiGuncelle` (telefon/rol değişince `telefonla_giris`), `kimlikHesabiSil`.
- `kullanici.id` ve `hasta_kullanici.id` zaten `kimlik_kullanici(id)` FK'sidir; ters yönde `kimlik_kullanici.klinik_id/hasta_id` bağ kolonlarıdır (`0005`, ON DELETE CASCADE).

### Şifre akışları — `lib/auth/sifre-islemleri.ts`
- `sifreDegistir`: mevcut şifre doğrulanır, politika (≥10 karakter, harf+rakam), diğer oturumlar iptal edilir (**Better Auth bu cihaz için YENİ oturum üretir → dönen `cerezler` yazılmalıdır; Next server action'da `nextCookies` bunu otomatik yapar**), `sifre_degistirmeli` bayrağı temizlenir. Hız sınırlı (fail-closed).
- `sifremiUnuttum` (yalnız personel): her durumda AYNI yanıt; hesap/IP başına hız sınırı (fail-closed: sayaç yazılamazsa e-posta gitmez); Better Auth sıfırlama jetonu **tek kullanımlık, 30 dk**; e-posta gövdesinde **kişisel veri yok** (`lib/auth/eposta.ts`: sabit konu "Klinik bildirimi", yalnız bağlantı). Gönderici enjekte edilir (`epostaGondericiAyarla`); bağlanana kadar HİÇBİR ŞEY GÖNDERMEZ (Aşama 7a: merkez/Resend).
- `sifreSifirla`: jeton + yeni şifre; sıfırlama sonrası tüm oturumlar iptal, bayraklar temiz. Hasta sıfırlaması resepsiyon geçici şifresiyle kalır.

### Better Auth sürüm notları (1.7.14, resmî belge + paket tipleriyle doğrulandı)
- `database: Pool` (pg) → Kysely; tablo/kolon adları `user|session|account|verification.modelName/fields`; ek alanlar `additionalFields.<ad>.fieldName`; ID: `advanced.database.generateId`; şema doğrulaması AÇIK (kullanılmayan OAuth kolonları `kimlik_hesap`ta var, `0005`).
- Parola: `emailAndPassword.password.hash/verify` (argon2id, `@node-rs/argon2`; belgedeki parametreler). `disableSignUp: true`; hesapları biz oluştururuz.
- Oturum: `session.expiresIn` (12 sa), `updateAge` (1 sa), `cookieCache` KAPALI (iptal anında etkili olsun); çerez `klinik.session_token`; `advanced.useSecureCookies` üretimde; `advanced.ipAddress.disableIpTracking` + IP hash'i `databaseHooks.session.create.before` ile.
- Sunucu API: `auth.api.signInEmail|changePassword|signOut({ …, headers, returnHeaders: true })` → `{ headers, response }`; `requestPasswordReset`, `resetPassword`, `getSession({ headers })`.
- `auth.$context`/`internalAdapter` belgelenmemiştir: kullanılmadı. Better Auth'un kendi hız sınırı kapalıdır (`auth.api` çağrılarına zaten uygulanmaz); kendi DB sayacımız (fail-closed) kullanılır.
- Test ortamında `KLINIK_AUTH_NEXT_COOKIES=0` (nextCookies eklentisi Next istek bağlamı ister).

## 5. Anonim uçlar — `lib/guvenlik/anonim-uc.ts`
```ts
const sonuc = await anonimUcCalistir({ ucAdi: "qr_kayit", kisaKod, basliklar: await headers(), qrTipi: "hasta_on_kayit" },
  async (tx, klinik) => { await tx.insert(sema.hasta).values({ id: crypto.randomUUID(), klinikId: klinik.id, … }); });
```
Sıra: hız sınırı (IP+kod, **fail-closed**) → kısa kod → klinik (`tanima`) → QR açık mı → `withAnonim(tenant)`. **Klinik kimliği form alanından ASLA alınmaz** (eski kodda gizli `klinik_id` alanı vardı; taşınırken kaldırılır). DB düzeyinde (0005) `hasta`/`anket_yaniti`/`is_basvurusu` anonim INSERT politikaları `klinik_id = current_klinik_id()` ve QR'ın açık olmasını zorlar; `INSERT … RETURNING` çalışmaz (anon'a SELECT yok) → kimliği sunucuda üretin. **Sınır**: DB tenant bağlamını (`app.tenant_id`) uygulamadan alır; uygulama bu değeri istemciden değil kısa koddan türetmelidir.

## 6. Hız sınırı — `lib/guvenlik/hiz-siniri.ts`
`hizSiniriKontrol` (artırmadan bak), `hizSiniriKaydet` (artır), `hizAnahtari`, `istemciImzasi` (IP hash). **Giriş ve anonim uçlarda FAIL-CLOSED**: sayaç okunamazsa/yazılamazsa istek reddedilir. IP başlığı: `x-real-ip` (Caddy güvenilen tek kaynak olarak ayarlar).

## 7. Testler
- `npm test` (birim, DB'siz) ve `npm run test:db` (gerçek Postgres 18, iki klinikli düzenek; ilk kez `cd scripts/dev && npm install`). `tests/db/*.test.ts` + `scripts/dev/kontrol-calistir.mjs` (bypassrls, yetki matrisi, DEFINER duman testi, anonim kayıt, yetkisiz tablo yazma).
- Yeni özellik testi: `ortamKur()` (env), `personelKur/hastaKur` (hesap + tenant satırı), `cerezBasligi(setCookies)` (oturum başlığı), `reddedilmeli(promise, /desen/)` (drizzle hata zincirini açar).

## 8. Başka projeye taşıma
1. **Aynen alınır**: `lib/db/*` (adlandırma Türkçe kalabilir), `lib/guvenlik/*`, `lib/auth/*` (oturum, giriş, şifre, hesap, proxy-karari), `scripts/dev/*` (şema üretimi + kontrol), `db/kontrol/*` kalıbı, `eslint.config.mjs` kısıtları, rol modeli (`klinik_uygulama`, `kimlik_rolu`, `klinik_anonim`, `klinik_tanima`, `bakim_rolu`, `klinik_yedek`; `db/kurulum/00_roller.sql`).
2. **Proje başına değişir**: tenant adı (`klinik` → o projenin tenant'ı; `app.tenant_id` GUC adı ve `current_klinik_id()` aynı kalabilir), tenant tablosu listesi (FORCE kuralı `klinik_id` kolonuna bakar), `tanima` fonksiyonlarının tabloları, rol isimleri/`kullanici` tablosu, `kimlik_kullanici.tur` değerleri, e-posta göndericisi, giriş sayfaları.
3. **Sıra**: roller → veritabanı → eklentiler → `0001` (kimlik + bağlam) → proje şeması (FORCE RLS + sahip politikası: `sahip_aktif_tenant`) → `tanima` → kimlik bağlantıları → `kontrol-calistir.mjs` yeşil olana kadar. Tüm tenant tablolarına FORCE RLS ve **kodda kullanılan işlemlere göre** daraltılmış yetki (taramayı `kullanim-tara.mjs` yapar) bu kalıbın özüdür.
4. Her projede `bypassrls-kontrol.sql` ve `yetki-matrisi.sql` CI/dağıtım öncesi çalıştırılmalıdır.

## 9. Bilinen sınırlar
- Tenant bağlamı uygulamadan gelir (DB bunu doğrulayamaz); savunma: tek kapı (`lib/db`), ESLint, RLS, anonim politikalarda QR/klinik eşleşmesi.
- Eski Supabase tabanlı sayfa/eylemler (161 dosya) henüz taşınmadı: bu dalda `gecerliKullanici`/`gecerliHasta`/`eylemYetkisiGetir` hâlâ Supabase oturumunu bekler → panel/portal sayfaları modül modül `getSessionContext` + `withTenant`'a geçirilecek (Aşama 3 devamı, `docs/service-role-siniflama.md`). `components/scheduled-logout.tsx` (gece zorla çıkış) ve `lib/qr/hiz-siniri.ts` (fail-open) bu taşımada değişecek.
- Tek oturum kilidi yazılmadı (`oturum.cihaz_kimligi` ve `son_etkinlik` hazır).
- E-posta göndericisi bağlı değil (varsayılan: gönderme + uyarı).

## Canlı olaylar (SSE + LISTEN/NOTIFY)

Sunucu: tabloya `canli_olay_bildir()` tetikleyicisi ekle (yeni migration) + `lib/realtime/olay.ts > CANLI_TABLOLAR`'a adı yaz. Yük yalnız `{t,i,k}`; veri taşıma. İstemci: `useCanliOlaylar({ tablolar: ["randevu"], onOlay, onSenkron, etkin })` — `onOlay`/`onSenkron` içinde veriyi normal yetkili yoldan (sunucu eylemi/route, `withTenant`) yeniden çek; ilk yüklemede `onSenkron` çağrılmaz. Dönen `baglanti` ("baglaniyor" | "bagli" | "kopuk") çevrimdışı rozeti için kullanılır. Route: `app/api/canli/route.ts` (tenant yalnız oturumdan). Caddy'de bu yolda `flush_interval -1` şart (`docs/sunucu-kurulum.md` §3b3).

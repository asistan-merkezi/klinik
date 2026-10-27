# Giriş Akışları (mevcut durum) ve Better Auth Seçenekleri

Tarih: 2026-10-27 · Kaynak: `app/(app)/giris/actions.ts`, `app/(app)/portal/giris/actions.ts`, `lib/auth/*`, `app/(app)/panel/personel/actions.ts`, `app/(app)/panel/hastalar/[id]/actions.ts`, `supabase/migrations/20260920120000_personel_telefon_girisi.sql`, `20260727200000_musteri_portal.sql`. **Karar verilmedi**; seçenekler sona yazıldı.

## 1. Mevcut akışlar

| Akış | Kimler | Giriş tanımlayıcısı (kullanıcının yazdığı) | Doğrulama | Arka planda kullanılan kimlik | Tablolar |
|---|---|---|---|---|---|
| **Panel — e-posta** (`/giris`, `girisYap`) | `klinik_admin`, `super_admin` (başka rol e-postayla girerse oturum açılıp hemen kapatılır: "yalnızca telefonla") | Gerçek (kurumsal) e-posta | Parola (Supabase `signInWithPassword`) | `auth.users.email` | `auth.users`, `kullanici` (rol) |
| **Panel — telefon** (aynı form; `@` yoksa telefon sayılır) | `terapist`, `resepsiyon`, `muhasebe` (admin/super_admin RPC tarafından bilerek dışlanır) | Telefon (karışık format kabul; `telefon_normalize` son 10 hane) | Parola | Telefon → `personel_giris_epostasi(telefon)` RPC'si (anon çağırabilir, DEFINER) → kayıtlı **gerçek e-posta** → `signInWithPassword(e-posta)` | `kullanici.telefon` (global tekil: `idx_kullanici_telefon_normalize`), `auth.users` |
| **Hasta portalı** (`/portal/giris`, `portalGirisYap`) | Hasta (`hasta_kullanici`) | Telefon (ham string eşleşmesi) | Parola: resepsiyonun "Portal Erişimi Aç"la ürettiği 8 karakterli geçici şifre (`crypto.randomInt`, büyük harf). Girişte küçük harfle yazıldıysa büyük harfle bir kez daha denenir | Telefon → `portal_giris_epostasi(telefon)` RPC'si (anon, DEFINER) → **sentetik e-posta** `m-{hasta.id}@portal.local` → `signInWithPassword` | `hasta`, `hasta_kullanici` (`aktif`), `auth.users` |
| **QR puantaj** (`/puantaj/[kisaKod]/[tur]`) | Personel | Yok — oturum yoksa yukarıdaki panel girişine `?donus=` ile yönlenir (`guvenliDonusAdresi`, open redirect yok) | Panel girişiyle aynı | `auth.uid()` (`personel_puantaj_kendi_kaydet`) | `personel_puantaj` |
| **Super admin** | `super_admin` | Panel e-posta akışı (ayrı ekran yok) | Parola | — | `kullanici` (`klinik_id` NULL) |
| **Anonim formlar** (QR ön kayıt, anket, iş başvurusu) | Kimliksiz | Yok | Yok (hız sınırı + KVKK onayı + QR açık/kapalı) | `anon` | bkz. anonim kayıt testi |

**Giriş sonrası ortak adımlar**: `oturumKilidiYenile` (tek oturum kilidi — şu an canlıda aktif değil, taşıma sonrasına ertelendi) · kaba kuvvet koruması `lib/auth/giris-hiz-siniri.ts` (hesap başına 15 dk'da 5 hatalı deneme, IP başına 30; sayaç `hiz_siniri_kullan`, **fail-open**) · rol/klinik `kullanici` satırından (`gecerliKullanici`, JWT claim değil).

**Hesap yaşam döngüsü (hepsi yönetici eylemi, kullanıcı kendi kendine yapamaz)**: personel hesabı `auth.admin.createUser` (gerçek e-posta + geçici şifre `geciciSifreUret`) · portal hesabı `createUser(sentetik e-posta)` + `hasta_kullanici` INSERT, hata olursa `deleteUser` · şifre yenileme yalnız `updateUserById` ile yönetici tarafından (geçici şifre yeniden üretme) · işten çıkış: `updateUserById` ile ban. **Kullanıcının kendi şifresini değiştirme / "şifremi unuttum" akışı kodda YOK.** SMS/e-posta doğrulama kodu (OTP) akışı YOK (CLAUDE.md: "OTP DEĞİL").

**Yan kısıtlar**: telefon tekilliği yalnız `kullanici` için global; hasta telefonu klinikler arası tekil değil — `portal_giris_epostasi` `LIMIT 1` ile ilk eşleşeni döndürür (aynı numaralı iki klinikte hasta varsa hangisinin döneceği belirsiz). Hata mesajları hesap varlığını sızdırmayacak şekilde ortak ("Telefon veya şifre hatalı").

**Aşama 2 etkisi (2026-10-27):** `personel_giris_epostasi` ve `portal_giris_epostasi` fonksiyonları şemadan **kaldırıldı** (FORCE RLS altında tenant'sız çalışmıyorlardı ve anonim telefon→e-posta eşlemesi enumeration yüzeyiydi). Telefon/e-posta ile kullanıcı bulma artık yalnız `kimlik_rolu` bağlantısıyla (Better Auth) yapılır; `kimlik_kullanici`/`kimlik_hesap`/`oturum`/`kimlik_dogrulama` tablolarının tek erişimcisi bu roldür. Yani A seçeneğindeki "telefon → e-posta çevirimi" artık uygulama sunucusunda `kimlik_rolu` sorgusu olarak yazılır; `kullanici.telefon` ve `hasta` telefonu tenant verisi olduğundan, çevirim için `kimlik_kullanici.telefon`/ayrı eşleme kolonu gerekir (seçime göre Aşama 4'te şemaya eklenir).

## 2. Better Auth'ta karşılama seçenekleri (karar bekliyor)

Better Auth çekirdeği e-posta+parola (credentials) sağlar; telefonla girişi **phone number plugin** (telefon + parola, isteğe bağlı SMS OTP), kullanıcı adıyla girişi **username plugin** karşılar; ayrıntı ve alan adları kullanılacak sürümün belgelerinden Aşama 4'te doğrulanacak (bu belge bir sürüme karşı denenmedi).

**Seçenek A — Tanımlayıcıyı uygulamada e-postaya çevirmek (bugünkü desenin aynısı)**
Giriş formu aynı kalır; sunucu eylemi telefonu `kullanici`/`hasta_kullanici`'dan e-postaya çevirir ve Better Auth e-posta+parola girişini çağırır. Hasta için sentetik e-posta (`m-{id}@portal.local`) korunur. Çeviri `kimlik_rolu` bağlantısıyla yapılan dar bir sorgu olur, anonim DEFINER RPC (`*_giris_epostasi`) **kalkabilir** (anon'a açık sorgu azalır). Artı: en az değişiklik, mevcut veri taşınır, OTP altyapısı gerekmez. Eksi: sentetik e-posta ve telefon→e-posta eşlemesi uygulamada kalır; hasta telefon tekilliği sorunu aynen sürer.

**Seçenek B — Better Auth phone number plugin (telefon birincil tanımlayıcı, parola)**
`kimlik_kullanici.telefon` birincil giriş alanı olur; hasta için sentetik e-posta gerekmez. Artı: eşleme kodu kalkar. Eksi: telefon tekilliği klinikler arası zorunlu olur (hasta tarafında bugün değil → veri çakışması riski, hasta telefonları karışık formatta); eklenti alan adları/şema uyumu doğrulanmalı; personelde "yalnız admin e-posta ile" kuralı ayrıca uygulama koduyla korunmalı.

**Seçenek C — Telefon + SMS tek kullanımlık kod (OTP)**
Parola yerine/yanında SMS kodu. Artı: geçici şifre dağıtımı ve unutulan şifre sorunu azalır. Eksi: SMS maliyeti ve operatör bağımlılığı (mesaj merkezi henüz bağlı değil), mesaj içeriği KVKK kuralı (kod dışında veri yok — uygun), telefon doğrulaması gerekir, kısa kodlar için hız sınırı/kaba kuvvet koruması şart. Mevcut kural "OTP DEĞİL" idi; bu bir ürün kararı.

**Seçenek D — Karma**: personel/admin = e-posta+parola (A veya B), hasta portalı = telefon+parola (geçici şifre) → ilk girişte zorunlu şifre belirleme; ileride hasta için C.

**Hangisini seçersen yapılması gerekenler (ortak)**: toplu şifre sıfırlama (karar 1) için ilk giriş şifre belirleme akışı · kullanıcının kendi şifre değiştirme / unuttum akışı (bugün yok) · `devre_disi` bayrağıyla işten çıkış engeli ve oturum iptali · giriş hız sınırının fail-open kararı (anonim ve giriş uçlarında **fail-closed** önerilir) · `kullanici.telefon` global tekilliğinin korunması · `cihaz_kimligi` yazımı (tek oturum kilidi sonradan eklenecek) · QR puantaj `?donus=` akışının korunması.

## 3. KARARLAR (2026-10-27) ve uygulama durumu

**Seçenek D seçildi.** Uygulama: `lib/auth/giris.ts`, `lib/auth/hesap.ts`, `lib/auth/sifre-islemleri.ts` (kılavuz: `docs/platform-katmani.md`).

| Karar | Uygulama |
|---|---|
| Personel/admin = e-posta+parola; telefonla giren personel için telefon→e-posta çevirimi sunucuda `kimlik_rolu` ile dar sorgu (anonim DEFINER RPC yok) | `personelGirisi`; `kimlik_kullanici.telefon_norm` + `telefonla_giris` (admin/super_admin = false). Eski `*_giris_epostasi` RPC'leri kaldırılmıştı (Aşama 2) |
| Hasta portalı = (klinik, telefon) + parola; portal adresi kliniğe özel (kısa kod), klinik `tanima` şemasından çözülür | `hastaGirisi`; `/portal/[klinikKodu]/giris`; `tanima.klinik_qr_bilgisi_getir` |
| Eşleme kimlik katmanında `(klinik_id, telefon_normalize)` tekil; personel telefonu global tekil; hasta telefonu klinikler arası tekil olmak zorunda değil | `db/migrations/0005`: `kimlik_hasta_klinik_telefon_tekil`, `kimlik_personel_telefon_tekil` (kısmi tekil indeksler). Test: aynı numara iki klinikte iki ayrı hesap |
| Tenant tablosundan kimlik kaydına bağ | `kullanici.id` / `hasta_kullanici.id` zaten `kimlik_kullanici(id)` FK'si (ortak anahtar); ters yönde `kimlik_kullanici.klinik_id` ve `hasta_id` (ON DELETE CASCADE) eklendi. Ayrı bir kopya kolon eklenmedi (ortak anahtar yeterli) |
| OTP/SMS yok; hasta için geçici şifre (7 gün) + ilk girişte zorunlu değiştirme, değiştirmeden başka sayfaya geçiş yok | `gecici_sifre_bitis`, `sifre_degistirmeli`; süre dolunca giriş reddi + oturum açılmaz; `proxy-karari.ts` her korumalı sayfayı `/sifre-degistir`e yönlendirir. Personel geçici şifresi de ilk girişte değiştirilir (süre sınırı yok) |
| Kullanıcının kendi şifresini değiştirmesi | `sifreDegistir` + `/sifre-degistir` |
| Personel "şifremi unuttum" (tek kullanımlık, 30 dk, e-posta bağlantısı, hız sınırlı, ortak yanıt, e-postada kişisel veri yok) | `sifremiUnuttum`/`sifreSifirla`, `/sifremi-unuttum`, `/sifre-sifirla`; Better Auth sıfırlama jetonu. **E-posta göndericisi henüz bağlı değil** (Aşama 7a) |
| Hasta şifre sıfırlaması resepsiyon geçici şifresiyle | `geciciSifreYenile(id, { hasta: true })` |
| Giriş ve anonim uçlarda hız sınırı fail-closed | `lib/guvenlik/hiz-siniri.ts`; testlerle doğrulandı |
| İşten çıkış: `devre_disi` + açık oturumların iptali; `cihaz_kimligi` yazılır, tek oturum kilidi yok | `hesabiDevreDisiBirak`; `oturum.cihaz_kimligi` |
| Toplu şifre sıfırlama; bcrypt yükseltme kodu yok | Eski hash aktarımı yok; hesaplar yeniden oluşturulur (`personelHesabiOlustur`/`hastaHesabiOlustur`) |

Better Auth'ta **telefon eklentisi kullanılmadı**: telefonla giriş uygulama katmanında (Seçenek A/D) çözülüyor; kütüphane yalnız e-posta+parola kimliğini taşıyor (hasta için sentetik e-posta `h-{hastaId}@portal.invalid`, kullanıcıya gösterilmez).

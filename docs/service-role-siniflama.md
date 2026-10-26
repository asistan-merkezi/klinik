# Service Role Sınıflaması

Tarih: 2026-10-26 · Dal: `tasima/windows-postgres` · Kaynak: `grep createAdminClient` (22 dosya) + çağrı bağlamı okuma. Satır numaraları bu tarihteki `main` ile aynıdır.

**Sınıflar**
- **(a) Sistem işi** → `scripts/` altında Node betiği, Task Scheduler çağırır, `bakim_rolu` ile bağlanır (klinik listesi: `klinik` üzerinde yalnız SELECT), klinik başına iş `withTenant` ile.
- **(b) Kullanıcı bağlamında yapılmalı** → `withTenant` (kullanıcının kendi kimliği/tenant'ı); gerekli ek okuma/yazma yetkisi RLS politikası + kolon GRANT'iyle verilir.
- **(c) Oturum öncesi (anonim) akış** → dar, tek amaçlı fonksiyon; tenant bağlamı yoktur.

**Tasarım ilkesi (FORCE RLS altında)**: hiçbir fonksiyon veya rol RLS'i atlamaz (bakim_rolu dahil, bkz. plan). SECURITY DEFINER fonksiyonlar sahibinin yetkisiyle çalışır ama sahip de RLS'e tabidir; bu yüzden bir fonksiyonun "başka kullanıcının satırını görmesi" gerekiyorsa bu **politika** ile (satır) ve **kolon GRANT'i** ile (veri azaltma) açıkça verilir. "Service role gizlice her şeyi görür" kısayolu hedefte yoktur.

## Doğrudan kullanım (22 dosya)

| # | Dosya | Satır | Neden service role | Sınıf | Hedef çözüm |
|---|---|---|---|---|---|
| 1 | `lib/supabase/admin.ts` | 1–14 | İstemci tanımı | — | **Silinir** (Aşama 3 sonu). Yerine `lib/db/` (`withTenant`) ve `scripts/lib/bakim-baglanti.ts` |
| 2 | `app/(app)/panel/ayarlar/mesajlasma/actions.ts` | 163 | Test mesajını `mesaj_kuyrugu`'na yazmak; kuyruk INSERT'i kullanıcı rollerine kapalı | (b) | `withTenant`; `mesaj_kuyrugu` INSERT'i yalnız `klinik_admin` ve `test_mi=true` için politika. Alıcı: kendi hesabı |
| 3 | `app/(app)/panel/ayarlar/mesajlasma/kredi/[kanal]/page.tsx` | 81 | `mesaj_kredi_senkronla` RPC'si yalnız service_role'e açık | (b) | RPC, `p_klinik_id = current_klinik_id()` doğrulamasıyla `klinik_uygulama`'ya açılır; sayfa render'ında yazma yerine ayrı bir server action (GET render'ında yazma yan etkisi de giderilir) |
| 4 | `app/(app)/panel/ayarlar/muhasebe-sync/actions.ts` | 72 | `parasut_client_secret` kolonu kullanıcı rollerine SELECT'e kapalı; "secret var mı" kontrolü | (b) | Secret hiç okunmaz: üretilmiş boolean kolon `parasut_secret_var` (GRANT'li) veya `secret IS NOT NULL` döndüren kolon-sınırlı görünüm |
| 5 | `app/(app)/panel/ayarlar/resmi-tatiller/actions.ts` | 147 | `resmiTatilleriGuncelle(admin, [klinikId])`: `resmi_tatil` (global) + `resmi_tatil_oneri` yazar | (b) | `withTenant`; kullanıcı butonu yalnız o kliniğin `resmi_tatil_oneri` satırlarını üretir. Global `resmi_tatil` yazımı yalnız betikte (satır 22) |
| 6 | `app/(app)/panel/hastalar/[id]/actions.ts` | 499–520 | Portal hesabı: `auth.admin.createUser` + `hasta_kullanici` INSERT, hata olunca `deleteUser` | (b) | Better Auth kullanıcı oluşturma + `hasta_kullanici` INSERT **tek `withTenant` transaction'ında** (rollback = silme gerekmez) |
| 7 | aynı | 547–549 | `auth.admin.updateUserById` ile geçici şifre | (b) | Better Auth parola ayarlama (sunucu API) aynı transaction/yetki kapısı altında (`eylemYetkisiGetir`) |
| 8 | `app/(app)/panel/hastalar/[id]/mesaj-actions.ts` | 50–51 | Kuyruk INSERT + klinik adı okuma | (b) | `withTenant`; `klinik` kendi satırı zaten okunur |
| 9 | `app/(app)/panel/personel/actions.ts` | 202–307 | Acil kişi/eğitim/mesleki belge yazımı, belge Storage'a yükleme | (b) | `withTenant` (klinik_admin yazma politikaları var); belge yüklemesi `DOSYA_KOKU` (Aşama 5) |
| 10 | aynı | 366–470 | Personel oluşturma: `auth.admin.createUser`, `kullanici`/`personel`/`terapist`/`is_basvurusu` INSERT, hata geri alma (`deleteUser`) | (b) | Better Auth kullanıcı + tüm INSERT'ler tek `withTenant` transaction'ı; elle geri alma kalkar |
| 11 | aynı | 530–640 | Personel güncelleme; işten çıkışta `auth.admin` ban; son klinik_admin kontrolü (kullanici sayımı) | (b) | `withTenant`; ban yerine Better Auth "devre dışı" + oturum iptali (Aşama 4) |
| 12 | `app/(app)/panel/personel/izinler/actions.ts` | 46–47 | İzin sonucu mesajı kuyruğa yazmak (`anlikMesajTetikle`) | (b) | `withTenant` |
| 13 | `app/(app)/panel/personel/izinlerim/actions.ts` | 121–123 | Personel kendi izin belgesini Storage'a yüklüyor (bucket politikası) | (b) | `DOSYA_KOKU` + yetkili route; yol `{klinik}/izin/{personel}/…` |
| 14 | aynı | 157–166 | Yöneticilere bildirim: `klinikAdminleriniGetir` başka kullanıcıların `kullanici` satırını okur (personel rolünde RLS engeller) | (b) | `withTenant` + `kullanici` için "aynı klinik yöneticisi satırlarını görme" politikası (yalnız `id, rol, telefon` kolon GRANT'i; e-posta `personel`'den). Politika Aşama 2 baseline'ına girer |
| 15 | `app/(app)/panel/randevular/actions.ts` | 118, 271, 715, 1293, 1535 | `terapistTarihteAtanabilirMi/terapistUygunlukGetir`: resepsiyon başka personelin `personel_izin_talebi` ve `personel_puantaj` kayıtlarını okur (RLS engeller) | (b) | `withTenant`; `personel_izin_cakisanlari_getir` benzeri **dar fonksiyon/politika**: yalnız tarih aralığı + durum kolonları (izin türü/belge görünmez; "rapor" bilgisi sağlık verisi) |
| 16 | aynı | 871–895 | `paketYenilemeUyarisiIsle`: kuyruk INSERT + klinik adı | (b) | `withTenant` |
| 17 | `app/api/cron/audit-log-bolum-olustur/route.ts` | 21–22 | `audit_log_bolum_olustur` RPC (DDL, service_role) | (a) | `scripts/audit-log-bolum-olustur.mjs`, `bakim_rolu`; fonksiyon sahibi `klinik_sahip` (DDL için), `bakim_rolu`'ne EXECUTE. Route silinir |
| 18 | `app/api/cron/kredi-senkron/route.ts` | 25–66 | Tüm kliniklerin merkez bakiyesini senkron + `audit_log` INSERT | (a) | `scripts/kredi-senkron.mjs`; klinik listesi bakim_rolu, klinik başına `withTenant` + RPC (tenant doğrulamalı, #3 ile aynı) |
| 19 | `app/api/cron/mesaj-kuyruk-isle/route.ts` | 32 | Tüm kliniklerin kuyruğunu işler (`kuyruk-isle.ts`) | (a) | `scripts/mesaj-kuyruk-isle.mjs`; kuyruk klinik başına `withTenant` taranır |
| 20 | `app/api/cron/personel-donem-otomatik-kapat/route.ts` | 71, 217, 262 | Tüm klinikler/personel için dönem kapatma + hesap hareketi (RPC'ler) | (a) | `scripts/personel-donem-otomatik-kapat.mjs`; klinik başına `withTenant`; RPC'lerdeki `service_role` kabulü kaldırılıp sistem bağlamı kabulü (aşağıda) eklenir |
| 21 | `app/api/cron/resmi-tatil-guncelle/route.ts` | 21 | Global `resmi_tatil` + tüm kliniklerin `resmi_tatil_oneri` | (a) | `scripts/resmi-tatil-guncelle.mjs`; global tablo yazımı yalnız bakim_rolu (bu tabloda yazma GRANT'i) |
| 22 | `lib/mesaj/anlik-tetikle.ts` | 1–6, 110 | `admin` parametresi: kuyruk INSERT | (b) | Parametre `withTenant` işlem nesnesi olur; betiklerden de (a) aynı fonksiyon çağrılır |
| 23 | `lib/mesaj/hasta-mesaji.ts` | 23–26 | Hasta + klinik adı okuma, kuyruk yazma (olay sonrası `after()`) | (b) | `withTenant` (olay zaten kullanıcı isteğinden doğuyor) |
| 24 | `lib/mesaj/kuyruk-isle.ts` | 27, 103, 113 | Kuyruk işçisi: durum güncelleme, kredi senkron | (a) | Betikte çağrılır (#19); `withTenant` işlemiyle |
| 25 | `lib/mesaj/randevu-mesaji.ts` | 47, 98 | Randevu olay mesajı (kullanıcı isteğinden) + `randevuHatirlatmalariniTara` (cron taraması) | (b) / (a) | Olay tetikleme (b) `withTenant`; hatırlatma taraması (a) betikte (#19) |
| 26 | `lib/qr/hiz-siniri.ts` | 32 | `hiz_siniri_kullan` yalnız service_role; anonim formlardan çağrılıyor, tenant yok | (c) | `hiz_siniri_sayac` global (FORCE dışı, doğrudan GRANT yok); tek amaçlı `hiz_siniri_kullan` fonksiyonu `klinik_anonim`+`klinik_uygulama`'ya EXECUTE. **BYPASSRLS gerekmez** (tabloda RLS yok) |
| 27 | `scripts/entegrasyon/yardimci.ts` | 32–33 | Entegrasyon testi: geçici klinik kurma/silme | (a) | Test amaçlı `bakim_rolu` bağlantısı + yalnız test veritabanı; üretim bilgisi yok |

Not: sayı 22 **dosya**dır; satır/yer bazında 27 giriş yazıldı çünkü bir dosyada birden çok bağımsız kullanım var. Tablonun 1. satırı tanım dosyasının kendisidir.

## Dolaylı tüketiciler (`admin` parametresi alanlar)
- `lib/randevu/terapist-uygunluk.ts` (46, 89) → #15 ile birlikte `withTenant`.
- `lib/tatil/oneri-uret.ts` (73, `select id from klinik`) → betikte (a): klinik listesi `bakim_rolu`; kullanıcı butonunda (#5) tek klinik.
- `lib/mesaj/anlik-tetikle.ts#klinikAdminleriniGetir` → #14 politikası.

## Oturum öncesi akışlar (service role kullanmıyor, ama (c) sınıfı)
Bunlar bugün `anon` rolüyle RPC çağırıyor; hedefte `klinik_anonim`: `personel_giris_epostasi` ve `portal_giris_epostasi` (telefon → giriş e-postası; Better Auth'ta giriş kimliği telefon/sentetik e-posta olarak yeniden tasarlanır, fonksiyonlar kalkabilir), `hasta_qr_self_servis_mi`, `qr_kodu_aktif_mi`, `klinik_qr_bilgisi_getir`, anonim `hasta` INSERT (`qr_self_servis`), anket yanıtı, iş başvurusu. Hepsi dar fonksiyon veya dar INSERT politikası; anon SELECT yok kuralı korunur (Aşama 2 baseline'ında test edilir).

## Sistem bağlamı kabulü (RPC'lerdeki `service_role` yerine)
Bugün bazı RPC'ler `auth.role() = 'service_role'` ile sistem çağrısını kabul eder (12 `auth.jwt/role` kullanımı). Hedefte bu, **oturum rolüne** bağlanır: `sistem_baglami()` = `session_user = 'bakim_rolu'` (giriş rolü; `SET ROLE` ile taklit edilemez; uygulama bağlantısı `klinik_uygulama` olduğundan hiçbir istekte doğru dönmez). Sistem bağlamında da RLS işler: `bakim_rolu` tenant tablolarında `app.tenant_id` verilmeden satır göremez.

## Sonuç
(a) **8 giriş** (5 cron route, kuyruk işçisi, randevu hatırlatma taraması, test yardımcısı) · (b) **18 giriş** · (c) **1 giriş** (+ oturum öncesi RPC'ler); #1 tanım dosyasıdır, silinir. Bu sınıflama Aşama 3 ve 7b'nin **ilk hedefidir**: her satır kapanınca tablo güncellenir ve `grep createAdminClient` boş olur.

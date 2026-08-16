# Personel Modülü — Mevcut Durum Raporu

> Ortak modül şemasına taşıma çalışmasının ilk adımı için hazırlanmıştır. **Hiçbir kod/migration değişikliği içermez** — tamamen canlı Supabase veritabanı (pooler üzerinden `information_schema`/`pg_catalog` sorgularıyla, `postgres.qvazyubhizznsdcjvesr` projesi) ve repo taraması ile toplanmış envanterdir. Tarih: 2026-08-15.

---

## 1. Supabase'deki `personel*` tabloları

Toplam **10 tablo**, hepsinde RLS **enabled** (force değil).

### 1.1 `personel` (ana tablo)

| Kolon | Tip | Null? | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| klinik_id | uuid | NO | — |
| kullanici_id | uuid | YES | — |
| ad_soyad | text | NO | — |
| gorev | text | NO | — |
| maas | numeric | YES | — |
| ise_giris_tarihi | date | YES | — |
| aktif | boolean | NO | `true` |
| created_at | timestamptz | NO | `now()` |
| updated_at | timestamptz | NO | `now()` |
| tc_kimlik_no | text | YES | — (legacy, düz metin — bkz. §7) |
| uzmanlik_tescil_no | text | YES | — |
| adres | text | YES | — |
| il | text | YES | — |
| ilce | text | YES | — |
| mahalle | text | YES | — |
| dogum_tarihi | date | YES | — |
| dogum_yeri | text | YES | — |
| cinsiyet | text | YES | — (CHECK: erkek/kadin/belirtilmemis) |
| eposta | text | YES | — |
| departman | text | YES | — |
| calisma_tipi | text | YES | — (CHECK: tam_zamanli/yari_zamanli/vardiyali/prim_usulu) |
| sgk_sicil_no | text | YES | — |
| ozel_yetki_override | jsonb | NO | `'{}'::jsonb` (placeholder, hiçbir RLS/UI kullanmıyor) |
| ise_baslama_notu | text | YES | — |
| fm_saatlik_ucret | numeric | YES | — (CHECK: >=0) |
| puantaj_pin_hash | text | YES | — (bcrypt, `crypt()`) |
| puantaj_pin_guncelleme_tarihi | timestamptz | YES | — |

**PK:** `id`. **Unique index:** `(klinik_id, tc_kimlik_no) WHERE tc_kimlik_no IS NOT NULL`. **Index:** `klinik_id`.

**FK (giden):** `klinik_id → klinik.id` (CASCADE), `kullanici_id → kullanici.id` (SET NULL).
**FK (gelen):** `personel_acil_kisi`, `personel_ekstra_hakedis`, `personel_hassas`, `personel_maas_gecmisi`, `personel_mesleki_belge`, `personel_odeme`, `personel_puantaj`, `personel_puantaj_donem`, `personel_vardiya_atama`, `terapist` (hepsi CASCADE) + `hasta_iletisim_log.personel_id`, `is_basvurusu.personel_id`, `randevu.antrenor_id` (SET NULL).

**Trigger:** `trg_personel_updated_at` (BEFORE UPDATE → `set_updated_at()`).

**RLS policy'leri (4):**
- `personel_select_admin_muhasebe` (SELECT): klinik_admin veya muhasebe, kendi kliniği
- `personel_select_klinik` (SELECT): kliniğindeki herkes
- `personel_select_portal` (SELECT): hasta portalı — kendi terapistini görebilir (terapist→randevu→current_hasta_id() join'i)
- `personel_yonet_admin` (ALL): sadece klinik_admin, kendi kliniği

### 1.2 `personel_hassas` (1-1, şifreli kimlik no)

| Kolon | Tip | Null? |
|---|---|---|
| personel_id | uuid (PK, FK→personel CASCADE) | NO |
| tc_kimlik_sifreli | bytea | YES |
| pasaport_no_sifreli | bytea | YES |
| created_at / updated_at | timestamptz | NO |

`pgp_sym_encrypt`/`pgp_sym_decrypt` (pgcrypto, `extensions` şemasında) ile şifreli — anahtar `app.settings.encryption_key` (DB'ye elle kurulur, migration'a gömülü değil). **Trigger:** `set_updated_at`. Düz metin client'a hiç dönmez; sadece `personel_hassas_maskeli_getir(personel_id)` RPC'siyle son 2 hane.

RLS: `personel_hassas_select_admin` (SELECT), `personel_hassas_update_admin` (UPDATE), `personel_hassas_upsert_admin` (INSERT) — üçü de sadece klinik_admin/super_admin. **Personelin kendisi bile SELECT edemiyor** (sadece RPC üzerinden maskeli görebiliyor).

### 1.3 `personel_acil_kisi` (1-N, acil durum kişisi)

id, personel_id (FK CASCADE), ad_soyad, yakinlik, telefon, created_at, updated_at — hepsi NOT NULL. Trigger: `set_updated_at`. RLS: klinik_admin yönetir; SELECT'te personelin kendisi de görebilir (`p.kullanici_id = auth.uid()`).

### 1.4 `personel_mesleki_belge` (1-1, sadece terapist rolünde anlamlı)

personel_id (PK, FK CASCADE), diploma_no, uzmanlik_belge_no, meslek_odasi_sicil_no, saglik_bakanligi_tescil_no, e_imza_sertifika_seri_no, e_imza_gecerlilik_tarihi, kase_gorsel_url (Storage path, `personel-belge` bucket), mali_sorumluluk_sigorta_police_no, mali_sorumluluk_sigorta_bitis_tarihi, created_at/updated_at. Trigger: `set_updated_at`. RLS: klinik_admin yönetir, SELECT'te personelin kendisi de görebilir.

### 1.5 `personel_maas_gecmisi` (append-only, tarihli maaş kaydı)

id, klinik_id (FK CASCADE), personel_id (FK CASCADE), maas (NOT NULL, CHECK >=0), gecerlilik_tarihi (NOT NULL, default CURRENT_DATE), ekleyen_kullanici_id (FK→kullanici SET NULL), created_at. **UPDATE/DELETE yok** — sadece INSERT/SELECT. Index: klinik_id, personel_id, gecerlilik_tarihi. RLS: klinik_admin yönetir (ALL); SELECT'te personelin kendisi de görebilir.

### 1.6 `personel_ekstra_hakedis` (bordro ek kalemleri: yol/yemek/mesai/avans/diğer)

id, klinik_id (FK CASCADE), personel_id (FK CASCADE), tur (CHECK: `yol|yemek|mesai|avans|diger` — **`sgk` 2026-08-09'da kaldırıldı**), tutar (NOT NULL, CHECK >0... aslında >=0), tarih (default CURRENT_DATE), aciklama, ekleyen_kullanici_id (FK SET NULL), created_at/updated_at, **puantaj_donem_id** (FK→personel_puantaj_donem SET NULL, unique partial index — dönem kapatma otomasyonunun "mesai" satırı bu alanla eşleşiyor, aynı dönem için ikinci kez otomatik satır eklenmiyor). Trigger: `set_updated_at`. RLS: klinik_admin/muhasebe SELECT edebilir, sadece klinik_admin yazabilir.

### 1.7 `personel_odeme` (Personel Takip — fiilen ödenen tutar)

id, klinik_id (FK CASCADE), personel_id (FK CASCADE), tutar (NOT NULL, CHECK >0), tarih (default CURRENT_DATE), aciklama, odeyen_kullanici_id (FK SET NULL), created_at. UPDATE/DELETE yok (append-only). Index: klinik_id, personel_id, tarih. RLS: klinik_admin yönetir; SELECT'te kendisi de görebilir.

### 1.8 `personel_puantaj` (günlük puantaj/mesai kaydı)

21 kolon — özet: id, klinik_id, personel_id, tarih (NOT NULL, `UNIQUE(personel_id, tarih)`), planlanan_baslangic/bitis (time, vardiyadan otomatik doldurulur), giris_saat/cikis_saat (timestamptz), mola_dakika (default 0, CHECK >=0), net_calisma_dakika/sapma_dakika/fazla_mesai_dakika/eksik_calisma_dakika (hesaplanmış, nullable int), fm_onay_durumu (CHECK: `bekliyor|onaylandi|reddedildi`, default bekliyor), fm_onaylayan_id (FK→kullanici SET NULL), fm_onay_tarihi, **durum** (CHECK: `calisti|izinli|raporlu|gelmedi|resmi_tatil`, NOT NULL — trigger ile otomatik dolar), **kaynak** (CHECK: `manuel|tablet|self_qr`, default `manuel`), not_metni, created_at/updated_at.

CHECK: `personel_puantaj_cikis_giristen_sonra` — çıkış saati girişten önce olamaz.

**Trigger'lar (5):** `trg_personel_puantaj_audit` (AFTER I/U/D → `audit_log_yaz()`), `trg_personel_puantaj_fm_onay_denetim` (BEFORE UPDATE — fm_onaylayan_id/tarih'i otomatik doldurur), `trg_personel_puantaj_klinik_id` (BEFORE INSERT → `derive_klinik_id_from_parent('personel','personel_id')`), `trg_personel_puantaj_updated_at`, `trg_personel_puantaj_varsayilanlar` (BEFORE INSERT — planlanan saat/mola/durum'u otomatik doldurur, terapist_izin'e bakar).

**RLS:** INSERT/UPDATE sadece klinik_admin VE `personel_puantaj_donemi_acik_mi(personel_id, tarih)` true ise (dönem kapalıysa yazılamaz). SELECT: klinik_admin, veya resepsiyon+`resepsiyon_puantaj_gorebilir_mi()` ayarı açıksa, veya personelin kendisi.

> **Not:** TS tipindeki `PuantajKaynak` (`types/puantaj.ts`) sadece `"manuel" | "tablet"` — DB'deki üçüncü değer `self_qr` (Puantaj PIN akışı) TS tipinde yok. Fonksiyonel bir hataya yol açmıyor (union daraltılmış görünüyor, gerçek değer sorunsuz akıyor) ama tip tanımı DB ile senkron değil.

### 1.9 `personel_puantaj_donem` (aylık dönem kapama/snapshot)

id, klinik_id, personel_id, yil (CHECK 2020-2100), ay (CHECK 1-12), durum (CHECK: `acik|kapali`, default acik), snapshot_net_saat/onayli_fm_saat/eksik_saat (numeric), snapshot_izin_gun/devamsizlik_gun (int), kapatan_id (FK→kullanici SET NULL), kapatma_tarihi, created_at/updated_at. `UNIQUE(personel_id, yil, ay)`.

Trigger'lar: audit (AFTER I/U/D), klinik_id türetme (BEFORE INSERT), updated_at. RLS SELECT deseni `personel_puantaj` ile aynı (yazma yalnızca `personel_puantaj_donem_kapat`/`_yeniden_ac` RPC'leri üzerinden, tabloya doğrudan INSERT/UPDATE policy'si yok — RPC'ler SECURITY DEFINER).

### 1.10 `personel_vardiya_atama` (haftalık vardiya planı)

id, klinik_id, personel_id (FK CASCADE), vardiya_turu_id (FK→vardiya_turu RESTRICT), haftanin_gunu (smallint, CHECK 0-6), gecerlilik_baslangic (default CURRENT_DATE), gecerlilik_bitis (nullable), created_at/updated_at. CHECK: `gecerlilik_bitis >= gecerlilik_baslangic` (varsa). **GiST exclusion-benzeri index** (`personel_vardiya_atama_cakisma_yok`, btree_gist ile `(personel_id, haftanin_gunu, daterange(...))`) — ama gerçek bir `EXCLUDE` constraint değil, sadece index (çakışma engeli DB seviyesinde zorlanmıyor, sadece sorgu hızlandırma amaçlı görünüyor — teyit için constraint listesine bakıldı, `EXCLUDE` tipi constraint yok).

Trigger'lar: audit, klinik_id türetme, updated_at. RLS: klinik_admin yönetir (INSERT/UPDATE), SELECT deseni diğer puantaj tablolarıyla aynı.

**⚠️ Bu tablo ve `vardiya_turu` DB'de tam donanımlı ama uygulamada hiçbir CRUD ekranı yok** — sadece `personel_puantaj_planlanan_getir()` RPC'si (puantaj günü otomatik doldururken) okuyor. 0 satır (bkz. §6).

---

## 2. Tenant kolonu ve helper fonksiyonlar

- **Tenant tablosu:** `klinik` (id, ad, subdomain, plan_turu, plan_bitis_tarihi, logo_url/logo_url_koyu, marka_renkleri jsonb, adres/il/ilce/mahalle, vergi bilgileri, iletişim, çalışma saatleri — 29 kolon toplam)
- **Tenant kolonu:** her tabloda **`klinik_id`** (uuid, FK→`klinik.id`)
- **Helper fonksiyonlar (hepsi `SECURITY DEFINER`, `SET search_path='public'`):**

| Fonksiyon | Dönüş | Tanım |
|---|---|---|
| `current_klinik_id()` | uuid | `SELECT klinik_id FROM kullanici WHERE id = auth.uid()` |
| `current_rol()` | `kullanici_rol_tipi` | `SELECT rol FROM kullanici WHERE id = auth.uid()` |
| `current_hasta_id()` | uuid | hasta portalı oturumu için (`hasta_kullanici`) |
| `is_super_admin()` | boolean | `current_rol() = 'super_admin'` |
| `derive_klinik_id_from_parent(parent_table, parent_id_col)` | trigger | parametrik — `TG_ARGV` ile parent tablodan `klinik_id` kopyalar (personel_puantaj/donem/vardiya_atama üçü de bunu kullanıyor) |
| `audit_log_yaz()` | trigger | genel amaçlı audit trigger — `audit_log`'a satırın tamamını (`to_jsonb`) yazar |

Bunların dışında personel modülüne özgü iki yardımcı yetki fonksiyonu daha var: `personel_puantaj_donemi_acik_mi(personel_id, tarih)` ve `resepsiyon_puantaj_gorebilir_mi()` (klinik_ayarlar.ayarlar->>'resepsiyon_puantaj_gorebilir' okur).

---

## 3. Rol adları

**Gerçek DB enum'ı** `kullanici_rol_tipi`, kolon `kullanici.rol` (NOT NULL) — **5 değer:**

1. `super_admin` — platform yöneticisi, `klinik_id` NULL olabilir (`kullanici_klinik_gerekli` CHECK: `rol='super_admin' OR klinik_id IS NOT NULL`)
2. `klinik_admin`
3. `resepsiyon`
4. `terapist`
5. **`muhasebe`** — CLAUDE.md'nin metin anlatımında geçmiyor ama hem DB enum'ında hem kod tarafında (`types/personel.ts` → `KullaniciRol`, `ROL_SECENEKLERI`) tam donanımlı, canlıda kullanılıyor (personel/personel_ekstra_hakedis RLS'lerinde SELECT yetkisi var)

**Kod tarafında tanımlı yer:** `types/personel.ts` — `export type KullaniciRol = "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe"` (bilinçli olarak `super_admin` hariç — yorum satırında gerekçe: klinik içi personel formundan atanabilirse multi-tenant güvenlik açığı doğar).

**`personel.gorev`** ayrı bir kavram — serbest metin iş unvanı ("Fizyoterapist", "Antrenör" vb.), `kullanici.rol` (sistem yetkisi) ile karışmıyor ama ilişkili değil (biri metin, biri enum).

---

## 4. `app/(app)/panel/personel` altındaki dosyalar

| Dosya | İş |
|---|---|
| `page.tsx` | `/panel/personel` → doğrudan `/liste`'ye redirect (hub artık yok) |
| `actions.ts` | `personelHesabiOlustur`, `personelBilgileriGuncelle`, `hizliPuantajKaydet` server action'ları |
| `personel-formu.tsx` | Personel oluşturma/düzenleme formu (Kişisel/İş/Sistem Yetkileri/[terapist ise]Mesleki Belgeler — tek `<form>` içinde adım adım) |
| `personel-listesi.tsx` | Client — arama (isim/görev/telefon) + göreve göre gruplama |
| `personel-satiri.tsx` | Tek personel kartı — avatar/isim/telefon/rozet + admin'e özel Giriş/Çıkış/Ödeme hızlı aksiyon satırı |
| `liste/page.tsx` | `/panel/personel/liste` — asıl personel listesi sayfası (server component, veri çeker) |
| `liste/loading.tsx` | Liste sayfası için Suspense fallback |
| `loading.tsx` | Hub (page.tsx) için Suspense fallback |
| `[id]/page.tsx` | Personel Detay — Kişisel Bilgiler/Ödemeler 2 sekmeli, `?tab=` |
| `[id]/loading.tsx` | Detay sayfası fallback |
| `[id]/actions.ts` | `maasAyarlariGuncelle`, `hakedisEkle`, `personelPuantajPinBelirle`, `personelPuantajPinSifirla` |
| `[id]/duzenle-personel-dialog.tsx` | "Düzenle" dialogu — `PersonelFormu`'nu `mod="duzenle"` ile açar |
| `[id]/hakedis-formu.tsx` | Ekstra hakediş ekleme formu (yol/yemek/mesai/avans/diğer) |
| `[id]/maas-formu.tsx` | Maaş ayarları formu (model + tutar + geçerlilik tarihi) |
| `[id]/puantaj-pin-formu.tsx` | Puantaj PIN belirleme (kendisi)/sıfırlama (admin) formu |
| `[id]/calisma-cizelgesi/page.tsx` | Aylık/yıllık puantaj tablosu sayfası |
| `[id]/calisma-cizelgesi/loading.tsx` | Fallback |
| `[id]/calisma-cizelgesi/actions.ts` | `gunKaydet`, `fmOnayGuncelle`, `donemKapat`, `donemYenidenAc` |
| `[id]/calisma-cizelgesi/aylik-tablo.tsx` | Aylık gün-gün puantaj tablosu (satır satır render) |
| `[id]/calisma-cizelgesi/yillik-tablo.tsx` | Yıllık ay-ay özet tablosu |
| `[id]/calisma-cizelgesi/gun-duzenle-dialog.tsx` | Bir günü düzenleme dialogu (giriş/çıkış/mola/durum/not) |
| `[id]/calisma-cizelgesi/fm-onay-butonlari.tsx` | Fazla mesai onayla/reddet butonları |
| `[id]/calisma-cizelgesi/donem-kapat-butonu.tsx` | Dönem kapat/yeniden aç butonu + dialog |
| `basvurular/page.tsx` | İş Başvuruları sayfası (klinik_admin-only) — PDF/QR + Bekleyen + Arşiv |
| `basvurular/actions.ts` | `basvuruDurumGuncelle` (sadece beklemede/olumsuz — "olumlu" `[id dışı]/actions.ts`'teki `personelHesabiOlustur`'a bağlı) |
| `basvurular/basvuru-listesi.tsx` | Bekleyen başvuru listesi (düz) |
| `basvurular/basvuru-arsivi.tsx` | Ay/yıl gruplu, katlanır arşiv (beklemede+olumsuz hepsi) |
| `basvurular/basvuru-satiri.tsx` | Tek başvuru kartı — 3 durum butonu + "Olumlu" ile `PersonelFormu` dialogu açar |
| `maas/page.tsx` | **Navigasyondan kaldırıldı ama route hâlâ var** — yıllık maaş tablosu sayfası |
| `maas/maas-yil-tablosu.tsx` | Yıl bazlı, ay ay tahakkuk eden maaş matrisi |
| `takip/page.tsx` | **Navigasyondan kaldırıldı ama route hâlâ var** — "alacak" (hakediş−ödenen) takip listesi |
| `takip/loading.tsx` | Fallback |
| `takip/actions.ts` | `odemeEkle` |
| `takip/takip-listesi.tsx` | Arama + kart listesi |
| `takip/takip-satiri.tsx` | Tek personel "alacak" kartı |
| `takip/odeme-formu.tsx` | Fiili ödeme ekleme formu |

**İlgili paylaşılan dosyalar (route dışında):** `lib/maas.ts` (maaş hesaplama — sabit/prim/baraj), `lib/puantaj.ts` (puantaj tarih/saat/özet hesaplama yardımcıları), `types/personel.ts`, `types/puantaj.ts`, `components/panel/is-basvuru-formu-pdf-butonu.tsx` (İş Başvuru Formu PDF), `components/panel/qr-kart.tsx` (İş Başvurusu QR kartı — genel amaçlı, personel'e özel değil).

---

## 5. Personel ile ilgili server action'lar

| Action | Dosya | İmza | Yazdığı tablo(lar) |
|---|---|---|---|
| `personelHesabiOlustur` | `app/(app)/panel/personel/actions.ts` | `(basvuruId: string \| null, _onceki, formData) => Promise<SonucDurumu>` | `auth.users` (admin.createUser), `kullanici`, `personel`, `is_basvurusu` (başvurudan geliyorsa), `terapist` (rol=terapist ise), `personel_acil_kisi`, `personel_hassas` (RPC), `personel_mesleki_belge`, Storage `personel-belge` |
| `personelBilgileriGuncelle` | aynı dosya | `(personelId, _onceki, formData) => Promise<SonucDurumu>` | `personel`, `kullanici`, `personel_acil_kisi`, `personel_hassas` (RPC), `personel_mesleki_belge`, Storage |
| `hizliPuantajKaydet` | aynı dosya | `(personelId, tur: "giris"\|"cikis", saat: string) => Promise<SonucDurumu>` | `personel_puantaj` |
| `maasAyarlariGuncelle` | `app/(app)/panel/personel/[id]/actions.ts` | `(personelId, terapistId, _onceki, formData) => Promise<SonucDurumu>` | `personel` (maas), `terapist` (model/prim/baraj), `personel_maas_gecmisi` (maaş fiilen değiştiyse) |
| `hakedisEkle` | aynı dosya | `(personelId, _onceki, formData) => Promise<SonucDurumu>` | `personel_ekstra_hakedis` |
| `personelPuantajPinBelirle` | aynı dosya | `(personelId, _onceki, formData) => Promise<SonucDurumu>` | `personel.puantaj_pin_hash` (RPC `personel_puantaj_pin_belirle`) |
| `personelPuantajPinSifirla` | aynı dosya | `(personelId) => Promise<SonucDurumu>` | `personel.puantaj_pin_hash` (RPC `personel_puantaj_pin_sifirla`) |
| `gunKaydet` | `[id]/calisma-cizelgesi/actions.ts` | `(personelId, tarih, _onceki, formData) => Promise<SonucDurumu>` | `personel_puantaj` (upsert) |
| `fmOnayGuncelle` | aynı dosya | `(personelId, puantajId, yeniDurum) => Promise<SonucDurumu>` | `personel_puantaj.fm_onay_durumu` |
| `donemKapat` | aynı dosya | `(personelId, yil, ay) => Promise<SonucDurumu>` | `personel_puantaj_donem`, `personel_ekstra_hakedis` (RPC `personel_puantaj_donem_kapat` — otomatik FM hakedişi) |
| `donemYenidenAc` | aynı dosya | `(personelId, yil, ay) => Promise<SonucDurumu>` | `personel_puantaj_donem` (RPC `personel_puantaj_donem_yeniden_ac`) |
| `basvuruDurumGuncelle` | `basvurular/actions.ts` | `(id, durum: "beklemede"\|"olumsuz") => Promise<SonucDurumu>` | `is_basvurusu` |
| `odemeEkle` | `takip/actions.ts` | `(personelId, _onceki, formData) => Promise<SonucDurumu>` | `personel_odeme` |

**RPC'ler** (çağrılan ama action olmayan, DB'de `SECURITY DEFINER`): `personel_hassas_kaydet`, `personel_hassas_maskeli_getir`, `personel_puantaj_pin_belirle`, `personel_puantaj_pin_sifirla`, `personel_puantaj_pin_ile_kaydet` (anon+authenticated, `/puantaj/[klinikId]/[tur]` public rotasından), `personel_puantaj_donem_kapat`, `personel_puantaj_donem_yeniden_ac`, `personel_puantaj_planlanan_getir`.

---

## 6. Mevcut satır sayıları (canlı, 2026-08-15)

| Tablo | Satır |
|---|---|
| `personel` | 5 |
| `personel_hassas` | 0 |
| `personel_acil_kisi` | 0 |
| `personel_mesleki_belge` | 1 |
| `personel_maas_gecmisi` | 0 |
| `personel_ekstra_hakedis` | 0 |
| `personel_odeme` | 0 |
| `personel_puantaj` | 2 |
| `personel_puantaj_donem` | 0 |
| `personel_vardiya_atama` | 0 |
| *(referans)* `terapist` | 5 |
| *(referans)* `is_basvurusu` | 1 |
| *(referans)* `kullanici` | 6 |

Veri hacmi çok düşük — migrasyon riski düşük, ama `personel_hassas`/`personel_acil_kisi`/`personel_odeme`/`personel_maas_gecmisi`/`personel_puantaj_donem`/`personel_vardiya_atama` gerçek anlamda hiç test edilmemiş (0 satır).

---

## 7. Rol/görev bilgisinin tutulduğu yer

İki ayrı, birbirinden bağımsız kavram var:

1. **Sistem yetkisi (rol):** `kullanici.rol` kolonu, `kullanici_rol_tipi` **enum**'ı (§3). `personel` tablosunda yok — `personel.kullanici_id` üzerinden `kullanici`'ye referans veriliyor (personel ↔ kullanici 1-1 opsiyonel; `kullanici_id` nullable, yani bazı personel kayıtlarının sisteme giriş hesabı olmayabilir).
2. **İş unvanı (görev):** `personel.gorev` — **serbest metin** kolon (enum değil). Personel Listesi bu alana göre gruplama yapıyor (aynı serbest metni yazan personel aynı grupta görünür, yazım tutarsızlığı riski var — CLAUDE.md'de Antrenör örneğinde bilinçli olarak "görev serbest metin, filtre yazım tutarsızlığına yol açar" diye not düşülmüş).

Ayrıca **kimlik doğrulama (T.C./pasaport)** ayrı bir üçüncü katman: `personel.tc_kimlik_no` (eski, düz metin, artık yeni formdan hiç yazılmıyor — geriye dönük uyumluluk için duruyor) vs. `personel_hassas.tc_kimlik_sifreli`/`pasaport_no_sifreli` (yeni, pgcrypto şifreli, tek doğru kaynak).

---

## Eksik olanlar (ortak modül şemasına göre)

- **Tenant izolasyonu tek kolonlu ve doğrudan:** her tabloda `klinik_id` var ama hiçbiri `derive_klinik_id_from_parent` dışında bir soyutlama katmanı kullanmıyor; ortak modül şeması farklı bir tenant kolon adı/mekanizması (örn. `tenant_id`, ayrı bir tenant-context tablosu) bekliyorsa **tüm 10 tabloda + 3 trigger'da + tüm RLS policy'lerinde kolon adı değişikliği** gerekecek.
- **`personel_vardiya_atama`/`vardiya_turu` için hiç UI yok** — şema var, CRUD ekranı hiç yazılmamış (0 satır, kanıtlanmamış).
- **Rol yönetimi UI'da ayrı bir tablo değil, enum genişletmesi gerektiriyor** — ortak şema "role" kavramını ayrı bir `roller` tablosunda mı tutuyor bilinmiyor; burada `kullanici_rol_tipi` enum'ı (5 değer) tek kaynak, DB seviyesinde genişletmek `ALTER TYPE ... ADD VALUE` (aynı transaction'da kullanılamaz, ayrı migration gerekir — CLAUDE.md'de bu kısıt daha önce not edilmiş).
- **`ozel_yetki_override` (jsonb) placeholder** — şema var ama hiçbir RLS/UI okumuyor; ortak modülün "özel yetki" kavramı varsa bu alanın gerçek anlam kazanması/kaldırılması gerekiyor.
- **Puantaj kaynak tipi TS/DB senkron değil** (`self_qr` DB'de var, TS union'da yok — bkz. §1.8 not).
- **`personel.tc_kimlik_no` legacy düz metin kolonu hâlâ duruyor** — `personel_hassas`'a taşınıp drop edilmedi (CLAUDE.md: "anahtar kurulu değilken canlı veriyi şifreleyip kolonu silmek geri alınamaz bir adım olurdu" kararıyla bilinçli olarak bırakılmış). Ortak şemaya taşınırken bu iki kaynağın (legacy + yeni şifreli) birleştirilmesi/temizlenmesi gerekecek.
- **Personel düzenleme geçmişi/versiyonlama yok** (maaş hariç — sadece `personel_maas_gecmisi` var); ad/görev/departman değişikliği audit_log'a düşmüyor (personel tablosunda audit trigger yok, sadece `personel_puantaj`/`personel_puantaj_donem`/`personel_vardiya_atama`'da var).
- **Personel silme (hard delete) akışı yok** — sadece `aktif` boolean ile pasifleştirme var, DELETE policy'si `personel` tablosunda tanımlı değil (ALL policy var ama uygulamada hiç silme çağrısı yok).

## İsim çakışması riski olanlar

- **`personel_odeme` vs. genel `odeme`/`odeme_kalemi`/`odeme_satiri`** — proje zaten hasta tarafında bambaşka bir "ödeme" kavramı ve tablo ailesi kullanıyor (Paraşüt fatura, paket satışı, bakiye hareketi). Ortak modül şemasında genel bir "payment"/"odeme" kavramı varsa `personel_odeme` isim/anlam çakışması yaratabilir (personel'e yapılan ödeme ≠ hastadan alınan ödeme).
- **`durum` kolon adı** — `personel_puantaj.durum`, `personel_puantaj_donem.durum`, `is_basvurusu.durum` üçü de aynı isimde ama tamamen farklı CHECK/enum kümeleri (`calisti|izinli|...` / `acik|kapali` / `beklemede|olumlu|olumsuz`). Ortak şema tek bir generic "durum" enum'ı öngörüyorsa bu üçü ayrı ayrı ele alınmalı.
- **`kaynak` kolon adı** — `personel_puantaj.kaynak` (`manuel|tablet|self_qr`) ile `randevu.kaynak`/`hasta_bakiye_hareket.kaynak` (`uygulama|arsiv`, CLAUDE.md'de ayrı bir bağlamda tanımlı) aynı isimde ama farklı değer kümeleri — genel bir "kaynak" alanı planlanıyorsa çakışabilir.
- **`gorev` (personel) vs. rol (kullanici)** — ikisi de "kim ne yapıyor" sorusuna cevap veriyor gibi görünse de biri serbest metin iş unvanı, diğeri sistem yetki enum'ı; ortak şemaya taşınırken bu ayrımın kaybolmaması gerekiyor (bkz. §7).
- **`muhasebe` rolü** — CLAUDE.md'nin genel anlatı metninde hiç geçmiyor (rol listesi orada 4 elemanlı yazılı), ama kodda/DB'de tam donanımlı 5. rol olarak var. Ortak modül şemasına taşınırken referans dokümantasyon güncel olmayabilir, DB/kod gerçek kaynak alınmalı.
- **`personel_hassas`/`hasta_hassas`/`personel_puantaj_pin_hash`** — üç ayrı hassas-veri deseni aynı projede bir arada: `hasta_hassas` (pgcrypto YOK, RLS-only), `personel_hassas` (pgcrypto VAR, tersine çevrilebilir şifreleme), `puantaj_pin_hash` (tek yönlü bcrypt hash). Ortak modül şeması "hassas veri" için tek bir desen bekliyorsa üçünün de tutarlı hale getirilmesi ayrı bir karar gerektirir.

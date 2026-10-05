# Personel Modülü — Ortak Modül Şemasına Taşıma: Migration Kapsamı

> `MEVCUT-DURUM.md`'nin devamı. Bu belge de **henüz SQL/migration dosyası değil** — 7 maddelik kapsam genişletmesinin her biri için somut tasarım kararlarını, mevcut şemaya etkisini ve (varsa) çözülmeden ilerlenemeyecek açık noktaları kayıt altına alıyor. Gerçek `supabase/migrations/*.sql` dosyası bu belge onaylandıktan sonra yazılacak. Veritabanına hiçbir şey uygulanmadı. Tarih: 2026-08-15.
>
> Her maddede **[VARSAYIM]** işaretli kısımlar benim makul gördüğüm varsayılan kararlar — onaylanmadıysa değiştirilebilir. **[AÇIK SORU]** işaretli kısımlar gerçekten bilgi eksikliğinden kaynaklanıyor (örn. "ortak modül şeması"nda henüz bu projede karşılığı olmayan bir tablo/alan tarif ediliyor) ve SQL yazılmadan önce netleşmesi gerekiyor.

---

## 1. Rol modeli: `kullanici_rol_tipi` yeniden kullanılacak

**Karar:** Yeni bir `personel_rol` enum'ı açılmayacak, mevcut `kullanici_rol_tipi` (5 değer) tek kaynak kalacak.

**Eşleme** (ortak modülün `admin/muhasebe/operasyon/personel` isimlendirmesi ↔ bizim enum):

| Ortak modül | `kullanici_rol_tipi` |
|---|---|
| admin | klinik_admin |
| muhasebe | muhasebe |
| operasyon | resepsiyon |
| personel | terapist |

Bu eşleme **veri değeri değil, sadece görüntüleme/entegrasyon** amaçlı olmalı (enum değerleri değişmiyor, sadece ortak modülün beklediği isimlerle eşleniyor). Yeni bir `SQL FUNCTION personel_ortak_rol_adi(kullanici_rol_tipi) RETURNS text` ile `CASE` üzerinden döndürülmesi öneriliyor — enum değerlerini DEĞİŞTİRMEDEN (mevcut 40+ RLS policy'si/RPC'si `'klinik_admin'` gibi literal string'lere bağlı, enum değerini yeniden adlandırmak tüm bunları kırar).

`super_admin` bu eşlemede yok — platform yöneticisi ortak modülün "klinik içi rol" kavramına hiç girmiyor (MEVCUT-DURUM §3'teki multi-tenant güvenlik gerekçesiyle tutarlı, `types/personel.ts`'teki `KullaniciRol` zaten `super_admin`'i dışlıyor).

**`pozisyonlar.varsayilan_rol` ve `personel.rol` bu enum'a bağlansın:**

- **`personel.rol` — [VARSAYIM]** Bugün `personel` tablosunda hiç `rol` kolonu yok (rol sadece `kullanici.rol`'de, `personel.kullanici_id` üzerinden dolaylı). Yeni `personel.rol kullanici_rol_tipi NULL` kolonu eklenmesi öneriliyor — **nullable**, çünkü `personel.kullanici_id` de nullable (giriş hesabı olmayan personel de olabiliyor, MEVCUT-DURUM §1.1). Enum tipi zaten kendi başına bir CHECK/FK görevi görür (Postgres enum'ları FK ile referans edilemez, "FK/CHECK ile bağlansın" isteği pratikte "kolon tipi `kullanici_rol_tipi` olsun" anlamına geliyor — ayrıca bir CHECK constraint eklemeye gerek yok).
  - **[AÇIK SORU]** `personel.kullanici_id` doluysa `personel.rol` ile `kullanici.rol` senkron mu tutulacak? Şu an `personelHesabiOlustur`/`personelBilgileriGuncelle` zaten `kullanici.rol`'ü yazıyor — aynı action'a `personel.rol`'ü de aynı değerle yazmak (kod değişikliği, migration'ın kapsamı dışında, ayrı bir görev) yeterli olur mu, yoksa DB seviyesinde bir senkron trigger mı isteniyor? **Varsayılan öneri: DB trigger YAZILMASIN** (iki farklı kaynaktan gelen iki alanın sürekli senkron tutulması için trigger yerine tek bir action'ın ikisini birden yazması daha basit ve mevcut "her yeni akış audit_log'a bağlansın" ilkesiyle çakışmıyor) — ama bu bir mimari tercih, onay bekliyor.

- **`pozisyonlar` tablosu — şema kullanıcı tarafından verildi (2026-08-15), aşağıdaki gibi somutlaştırıldı:**

  ```sql
  CREATE TABLE pozisyonlar (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    klinik_id        uuid NOT NULL REFERENCES klinik(id) ON DELETE CASCADE,
    sablon_id        uuid NULL,                    -- bkz. alt-madde (a): yerel FK yok
    ad               text NOT NULL,                 -- örn. "Fizyoterapist", "Resepsiyonist"
    grup             text NULL,                     -- örn. "Sağlık Personeli" / "İdari Personel" — Personel Listesi'ndeki gruplamanın yeni kaynağı
    sira             integer NOT NULL DEFAULT 0,     -- listede gösterim sırası
    aktif            boolean NOT NULL DEFAULT true,
    sistem_erisimi   boolean NOT NULL DEFAULT true,  -- bkz. alt-madde (b)
    varsayilan_rol   kullanici_rol_tipi NOT NULL,
    ucret_tipi       text NOT NULL,                  -- bkz. alt-madde (c): CHECK değer kümesi TBD
    puantaj_modu     text NOT NULL,                  -- bkz. alt-madde (d): CHECK değer kümesi TBD
    ozel_mi          boolean NOT NULL DEFAULT true,   -- sablon_id NULL ise mantıken true
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (klinik_id, ad)
  );
  ```

  Trigger'lar: `set_updated_at` (BEFORE UPDATE) + **`trg_pozisyonlar_audit`** (AFTER I/U/D → `audit_log_yaz()`) — bu tabloda hiç PII/hassas veri yok, `personel`'in aksine (§6'daki uyarı) blanket-audit burada tamamen güvenli, "pozisyon ayarı değişikliği" audit ihtiyacını (§6) doğrudan karşılıyor.

  RLS — projenin katalog/tanım tabloları deseniyle tutarlı (`islem_tanimi`/`paket`/`tedavi_protokolu`: herkes görür, sadece klinik_admin yönetir) **[VARSAYIM]**: `pozisyonlar_select_klinik` (SELECT, `klinik_id = current_klinik_id() OR is_super_admin()`), `pozisyonlar_yonet_admin` (ALL, klinik_admin + `WITH CHECK (klinik_id = current_klinik_id())`). `klinik_id` §7'deki gerekçeyle trigger'la değil doğrudan INSERT payload'ında/`WITH CHECK`'le zorlanıyor (personel'e child değil, personel'in kendisiyle aynı seviyede bir tablo).

  **Hâlâ netleşmesi gereken 4 alt-nokta:**

  **(a) `sablon_id` neyi işaret ediyor? [AÇIK SORU]** Bu DB'de "pozisyon şablonu" kavramı hiç yok. İki olası okuma: (i) projenin daha önce `mesaj_kredileri` için kurduğu "merkez" desenine benzer şekilde **Asistan Merkezi'ndeki merkezi/harici bir şablon kataloğuna** referans (bu durumda yerel bir FK constraint OLMAZ — `parasut_contact_id` gibi salt uuid kolonu), (ii) bu projede ayrıca **yerel bir `pozisyon_sablonu` tablosu** açılacak (muhtemelen `klinik_id IS NULL` = platform şablonu deseniyle, `olcek_tanimi`'nde kullanılan yaklaşımın aynısı). **Varsayılan olarak (i) ile ilerliyorum** (yerel FK yazmıyorum) — yanlışsa (ii) için ayrı bir tablo + FK eklemek küçük bir ek, onay/düzeltme bekliyor.

  **(b) `sistem_erisimi` ne anlama geliyor? [VARSAYIM]** "Bu pozisyondaki personelin sisteme giriş hesabı (kullanici satırı) olması gerekir/beklenir mi" bilgisi olarak yorumlanıyor — `personel.kullanici_id`'nin nullable olmasının (MEVCUT-DURUM §1.1) yapısal karşılığı. **Şu an bunu zorlayan bir CHECK/trigger önerilmiyor** (sadece bilgilendirici bir bayrak; personelHesabiOlustur akışı bugün zaten `eposta` alanına göre karar veriyor, `pozisyonlar.sistem_erisimi`'nin bu akışa bağlanması ayrı bir uygulama-katmanı işi). Yanlış yorumlanmışsa düzeltilmeli.

  **(c) `ucret_tipi` değer kümesi? [AÇIK SORU]** CHECK yazabilmek için değerler netleşmeli. Mevcut şemadaki en yakın emsal `terapist.maas_hesaplama_modeli` (`sabit|islem_basi_prim|barajli_prim`, sadece terapist'e özel) — **önerilen aday küme**, terapist-dışı pozisyonları da kapsayacak şekilde genelleştirilmiş: `sabit | saatlik | gunluk | prim_usulu`. Onaylanırsa CHECK bu değerlerle yazılır; farklıysa değiştirilir.

  **(d) `puantaj_modu` değer kümesi? [AÇIK SORU]** Benzer şekilde CHECK için netleşme gerekiyor. **Önerilen aday küme**: `giris_cikis` (PIN/tablet ile detaylı giriş-çıkış, bugünkü `personel_puantaj` akışının karşılığı) `| gunluk` (sadece gün bazlı işaretleme, saat yok) `| takip_yok` (bu pozisyon için puantaj hiç tutulmaz — örn. klinik_admin/muhasebe gibi roller). Onaylanırsa CHECK bu değerlerle yazılır.

  **`personel.gorev` ile ilişki [AÇIK SORU, henüz cevaplanmadı]:** `personel.gorev` (serbest metin) bu tabloya taşınıp `personel.pozisyon_id uuid FK→pozisyonlar` mı olacak (gorev kolonu ya kalkar ya salt-geçmiş/legacy kalır), yoksa `gorev` serbest metin olarak aynen kalıp `pozisyonlar` sadece ayrı, opsiyonel bir sınıflandırma mı olacak? Bu, migration'ın `personel` tablosuna dokunup dokunmayacağını belirliyor — henüz netleşmedi.

---

## 2. `muhasebe` rolü yetkileri (RLS)

| Tablo | Bugünkü durum | İstenen | Yapılacak |
|---|---|---|---|
| `personel_hesap_hareket` | **Tablo yok** — bkz. §2.1 | SELECT/INSERT/UPDATE | Yeni tablo + 3 yeni RLS policy |
| `personel_donem` (=`personel_puantaj_donem`?) | muhasebe hiç yok, sadece klinik_admin+kendisi SELECT | kapatma/açma | bkz. §2.2 |
| `personel_puantaj` | muhasebe hiç yok | sadece SELECT | `personel_puantaj_select` policy'sine `current_rol() = 'muhasebe'` OR'u eklenir |
| `personel` | zaten `personel_select_admin_muhasebe` ile SELECT var, `personel_yonet_admin` (INSERT/UPDATE/DELETE) zaten klinik_admin-only | INSERT/DELETE yok, SELECT ✅ | **Değişiklik gerekmiyor** — bugün zaten istenen durumda |
| `personel_hassas` | `personel_hassas_select_admin` ile klinik_admin doğrudan SELECT edebiliyor | **hiçbir role doğrudan SELECT yok** | Mevcut 3 policy (`select_admin`, `update_admin`, `upsert_admin`) **DROP** edilir — erişim tamamen §3'teki RPC'ye taşınır |

### 2.1 `personel_hesap_hareket` — [VARSAYIM]

Şu an personele yapılan ödeme (`personel_odeme`) ve ek hakediş (`personel_ekstra_hakedis`) **iki ayrı tabloda**, "alacak" hesabı her sorguda (`lib/maas.ts` + bu iki tablo) yeniden hesaplanıyor — ayrı bir ledger yok (MEVCUT-DURUM'da not edilmişti). `personel_hesap_hareket` adı, projenin zaten kanıtlanmış `hasta_bakiye_hareket` desenine (append-only ledger, `tur` alanlı) çok benziyor. Önerilen tasarım:

```
personel_hesap_hareket
  id uuid PK
  klinik_id uuid NOT NULL FK→klinik
  personel_id uuid NOT NULL FK→personel (CASCADE)
  tur text NOT NULL CHECK (tur IN ('odeme','hakedis'))   -- odeme: personel_odeme'nin yerini alır, hakedis: personel_ekstra_hakedis'in yerini alır
  alt_tur text NULL                                       -- hakedis ise: yol|yemek|mesai|avans|diger
  tutar numeric NOT NULL CHECK (tutar > 0)
  tarih date NOT NULL DEFAULT CURRENT_DATE
  aciklama text
  ekleyen_kullanici_id uuid FK→kullanici (SET NULL)
  puantaj_donem_id uuid FK→personel_puantaj_donem (SET NULL)  -- otomatik FM hakedişi bağlantısı için (bkz. personel_puantaj_donem_kapat)
  created_at timestamptz
```

**[AÇIK SORU]** Bu, iki mevcut tabloyu (`personel_odeme`, `personel_ekstra_hakedis`) **birleştirip DROP mu edecek**, yoksa üçüncü/paralel bir tablo olarak mı eklenecek? Birleştirme öngörüyorsam (§5'teki "vardiya temizliği" gibi net bir DROP talimatı bu maddede yok), veri taşıma adımı (0 satır olduğu için bu turda risksiz, MEVCUT-DURUM §6) + `lib/maas.ts`/`lib/raporlar/hesaplamalar.ts`/Personel Takip ekranının yeniden yazılması gerekir — bu, migration kapsamının çok ötesine geçen bir uygulama-katmanı değişikliği. **Öneri: bu migration'da SADECE tablo+RLS eklensin, `personel_odeme`/`personel_ekstra_hakedis`'e DOKUNULMASIN** (iki paralel sistem bir arada durur), birleştirme ayrı bir görev olarak planlansın. Onay bekliyor.

### 2.2 `personel_donem` — [AÇIK SORU]

Muhasebe'ye "kapatma/açma" yetkisi isteniyor — bu bugün `personel_puantaj_donem_kapat`/`_yeniden_ac` RPC'leri üzerinden yapılıyor (§1.9), ikisi de şu an `current_rol() = 'klinik_admin' OR is_super_admin()` kontrolü yapıyor. İki olasılık var:

- **(a) `personel_donem`, `personel_puantaj_donem`'in yeni adı** (RENAME) — bu durumda sadece 2 RPC'nin yetki kontrolüne `OR current_rol() = 'muhasebe'` eklenir + tablo `ALTER TABLE ... RENAME TO`.
- **(b) `personel_donem` bağımsız yeni bir tablo** — o zaman tam yapısı tanımlanmalı.

**Öneri: (a)** — işlevsel olarak %100 örtüşüyor, ayrı bir tablo açmanın gerekçesi görünmüyor. Bu varsayımla ilerliyorum, yanlışsa düzeltilir. RENAME edilirse: `personel_puantaj_donem`'e bağlı 3 trigger adı (`trg_personel_puantaj_donem_*`), 2 RPC (`personel_puantaj_donem_kapat/_yeniden_ac`), 1 unique index, `personel_ekstra_hakedis.puantaj_donem_id` FK'si ve TS tarafında `types/puantaj.ts`/`PersonelPuantajDonem` tipi + `calisma-cizelgesi/*.tsx` importları da güncellenmesi gerekir (kod değişikliği, kapsam dışına not düşülüyor — bu migration DB tarafını kapsar).

---

## 3. `personel_hassas` erişimi RPC'ye taşınıyor

**Karar:** `personel_hassas_getir(p_personel_id uuid, p_alan text) RETURNS text`, `SECURITY DEFINER`.

```
klinik_admin        → tüm alanlar (tc_kimlik, pasaport, iban...)
muhasebe             → sadece p_alan = 'iban'
personel (kendisi)   → sadece kendi kaydı, MASKELİ
current_klinik_id()  → atlanmadan her dalda kontrol edilir
```

### 3.1 `iban` alanı — [AÇIK SORU]

`personel_hassas` bugün sadece `tc_kimlik_sifreli`/`pasaport_no_sifreli` içeriyor (§1.2), **`iban` diye bir kolon yok**. Muhasebe'nin "sadece iban görebilmesi" isteniyorsa yeni bir şifreli kolon eklenmesi gerekiyor:

```sql
ALTER TABLE personel_hassas ADD COLUMN iban_sifreli bytea;
```

`personel_hassas_kaydet` RPC'sine de üçüncü bir parametre (`p_iban text`) eklenmesi gerekecek (aynı `pgp_sym_encrypt` deseni). **Bunu varsayım olarak ekliyorum** — onaylanmazsa "iban" ile aslında `tc_kimlik`/`pasaport`tan biri kastediliyorsa madde küçülür.

### 3.2 Maskeleme kuralı — [VARSAYIM]

Personelin kendi kaydını "maskeli" görmesi isteniyor ama maskeleme kuralı (son 2 hane mi, `personel_hassas_maskeli_getir`'deki gibi mi) belirtilmemiş. **Öneri:** mevcut `personel_hassas_maskeli_getir`'deki `right(deger, 2)` kuralı aynen tekrarlanır — tek fark, o fonksiyon tüm alanları tek JSON'da dönerken bu yeni fonksiyon tek bir `p_alan` için tek `text` döner (personelin kendisi çağırdığında maskeli, admin çağırdığında düz). `personel_hassas_maskeli_getir` bu yeni fonksiyonla **işlevsel olarak çakışıyor** — ikisi birden mi kalacak yoksa eskisi DEPRECATED mi olacak, netleşmedi (aşağıdaki "isim çakışması" listesine de eklendi).

### 3.3 Audit — teknik bir çelişki var

**"Her çağrı `audit_log_yaz()` ile loglansın"** isteği literal olarak uygulanamıyor: `audit_log_yaz()` bir **trigger fonksiyonu** — `NEW`/`OLD`/`TG_OP`/`TG_TABLE_NAME` gibi sadece trigger bağlamında var olan değişkenleri kullanıyor (§8'de tanım var), normal bir fonksiyondan (`personel_hassas_getir` gibi) çağrılamaz.

Projede bu tam senaryonun (bir SELECT/okuma eylemini loglamak, Postgres'te SELECT trigger olmadığı için) **zaten kanıtlanmış bir çözümü var**: `hasta_belge_goruntule(id)` RPC'si (CLAUDE.md/MEVCUT-DURUM'da geçmiyor ama canlıda mevcut) aynı ihtiyaç için `audit_log_yaz()` çağırmıyor, **fonksiyon içinde elle `INSERT INTO audit_log (...)` yapıyor**. `personel_hassas_getir` için de aynı desen öneriliyor:

```sql
INSERT INTO audit_log (klinik_id, kullanici_id, eylem, hedef_tablo, hedef_id, detay)
VALUES (v_personel.klinik_id, auth.uid(), 'goruntule', 'personel_hassas', p_personel_id,
        jsonb_build_object('alan', p_alan));  -- değer değil, sadece HANGİ alanın okunduğu
```

`personel_hassas_kaydet`'in zaten yaptığı gibi **`detay`'a asla gerçek değer konmaz** (sadece hangi alanın istendiği) — TC/pasaport/IBAN düz metninin audit_log'a sızmaması için.

---

## 4. `personel_puantaj.kaynak` değer kümesi genişliyor

**Yeni küme:** `yonetici | pin | self_qr | toplu | izin_talebi` (mevcut `manuel | tablet | self_qr`'ın yerine geçiyor).

- `self_qr` zaten aynı isimle kalıyor — dokunulmaz.
- **`manuel` → `yonetici`**, **[VARSAYIM]** `tablet` değeri hiçbir yerde fiilen kullanılmıyor (grep ile doğrulandı — sadece CHECK'te izin verilen bir değerdi, kod hiç yazmıyordu), doğrudan kaldırılabilir.
- `pin` — **[AÇIK SORU]** `self_qr` zaten "PIN ile QR üzerinden giriş" akışının (`personel_puantaj_pin_ile_kaydet` RPC) kaynağı olarak kullanılıyor (§1.8). Yeni `pin` değeri neyi temsil ediyor — `self_qr`'dan farklı bir "PIN girişi" senaryosu mu (örn. admin panelden PIN ile ama QR'sız)? Netleşmeden hangi RPC/action'ın `pin` mi `self_qr` mi yazacağına karar verilemiyor. **Öneri: `pin` eklenmesin, mevcut `self_qr` tek PIN kaynağı olarak kalsın** — onay bekliyor.
- `toplu` — muhtemelen ileride eklenecek bir "toplu puantaj girişi" (örn. tüm gün için tek tıkla "herkes çalıştı" işaretleme) özelliğine işaret ediyor; bugün böyle bir akış yok. Şemaya değer olarak eklenmesi zararsız (kullanılmayan bir CHECK değeri), **ekleniyor**.
- `izin_talebi` — `terapist_izin` onaylanınca `personel_puantaj_varsayilanlari_doldur()` trigger'ının zaten yaptığı otomatik "izinli/raporlu" durumu atamasıyla ilişkili görünüyor (§1.8) ama bugün bu trigger `kaynak`'ı hiç set etmiyor (varsayılan `manuel`/`yonetici` kalıyor). Bu değerin gerçek anlam kazanması için `personel_puantaj_varsayilanlari_doldur()`'a bir satır eklenmesi gerekir (izinden geliyorsa `kaynak='izin_talebi'` yazsın) — **migration'a dahil ediliyor**, düşük riskli bir trigger düzenlemesi.

**TS tarafı düzeltmesi:** Talepte `types/personel.ts` yazıyor ama gerçek konum **`types/puantaj.ts`** — `PuantajKaynak` tipi orada tanımlı (MEVCUT-DURUM §1.8'de zaten flag'lenmişti). Güncelleme o dosyada yapılacak:
```ts
export type PuantajKaynak = "yonetici" | "self_qr" | "toplu" | "izin_talebi";
```
(`pin` madde yukarıdaki açık soru netleşene kadar dahil edilmiyor.)

**Veri taşıma:** Canlıda `personel_puantaj`'da 2 satır var (§6) — mevcut `kaynak` değerleri (muhtemelen ikisi de `manuel`, hiçbiri `tablet` değil) `UPDATE personel_puantaj SET kaynak='yonetici' WHERE kaynak='manuel'` ile taşınacak, CHECK constraint DROP+CREATE ile yenilenecek, kolon `DEFAULT` değeri `'manuel'`'den `'yonetici'`'ye çevrilecek.

---

## 5. Vardiya temizliği — `personel_vardiya_atama` + `vardiya_turu` DROP

Onaylandı, gerekçe MEVCUT-DURUM'daki "eksik olanlar"la birebir örtüşüyor (0 satır, hiç UI yok, ortak modelde karşılığı yok).

**Etkilenenler (DROP öncesi envanteri):**
- Tablolar: `personel_vardiya_atama` (3 trigger, 1 GiST index, 3 RLS policy), `vardiya_turu` (yapısı §1'de yok ama `personel_vardiya_atama_vardiya_turu_id_fkey` ile referans ediliyor — önce `personel_vardiya_atama`, sonra `vardiya_turu` DROP edilmeli, sıra önemli çünkü `RESTRICT` FK var)
- Fonksiyonlar: `personel_puantaj_planlanan_getir(personel_id, tarih)` — **tamamen bu iki tabloya bağlı**, DROP edilmeli
- `personel_puantaj_varsayilanlari_doldur()` trigger fonksiyonu içinde `personel_puantaj_planlanan_getir(...)` çağrısı var (§1.8/§9) — bu satırlar (planlanan_baslangic/bitis'i vardiyadan doldurma mantığı) **kaldırılmalı**, yoksa fonksiyon DROP edilmiş bir fonksiyona referans verip kırılır.
- TS tarafı: `types/puantaj.ts` → `PersonelVardiyaAtamaSatir` tipi; `lib/puantaj.ts`'in bu tipi import eden kısmı; `[id]/calisma-cizelgesi/page.tsx`'in ilgili sorgu/prop'u (grep ile üç dosya teyitli, MEVCUT-DURUM'un dosya listesindeki tek kullanım noktaları).

**İstenen biçim:** DROP'lar migration dosyasının **en sonunda**, büyük harfli uyarı yorumuyla, ayrı bir bölümde — atlanabilir olacak şekilde. Gerçek SQL yazılırken şu iskelet izlenecek:

```sql
-- ============================================================
-- ⚠️  UYARI — GERİ ALINAMAZ: VARDİYA ŞEMASININ TAMAMEN SİLİNMESİ
-- Bu bölüm personel_vardiya_atama + vardiya_turu tablolarını ve
-- bunlara bağlı fonksiyon/trigger'ları DROP eder. 0 satır olduğu
-- doğrulandı (2026-08-15) ama YİNE DE istemiyorsan bu bloğu
-- ÇALIŞTIRMADAN migration'ın geri kalanını uygulayabilirsin.
-- ============================================================
-- DROP FUNCTION IF EXISTS personel_puantaj_planlanan_getir(uuid, date);
-- DROP TABLE IF EXISTS personel_vardiya_atama;
-- DROP TABLE IF EXISTS vardiya_turu;
```

---

## 6. Yeni akışlara `audit_log_yaz()` bağlanması

Mevcut durumu tek tek kontrol ettim — **bir kısmı zaten karşılanıyor**:

| Akış | Bugünkü durum |
|---|---|
| İzin onay/red | ✅ **Zaten var** — `terapist_izin` tablosunda `trg_terapist_izin_audit` (AFTER I/U/D) zaten kurulu, `onay_durumu` değişince otomatik loglanıyor. Ek işlem gerekmiyor (uygulamada bu akışın UI'ı henüz yok ama DB hazır). |
| Dönem kapatma/açma | ✅ **Zaten var** — `personel_puantaj_donem`'de `trg_personel_puantaj_donem_audit` zaten kurulu, `donemKapat`/`donemYenidenAc` RPC'lerinin yazdığı her satır zaten loglanıyor. |
| Ücret değişikliği | ❌ Eksik — `personel` (maas kolonu) ve `personel_maas_gecmisi`'nde hiç audit trigger yok. |
| Pozisyon ayarı değişikliği | ✅ **Artık çözülebilir** — `pozisyonlar` şeması netleşti (§1), tabloda PII yok, `trg_pozisyonlar_audit` (AFTER I/U/D → `audit_log_yaz()`) doğrudan eklenebilir. |
| PIN sıfırlama | ❌ Eksik — `personel_puantaj_pin_belirle`/`_sifirla` RPC'leri `personel.puantaj_pin_hash`'i güncelliyor ama audit_log'a hiç yazmıyor. |

### ⚠️ Önemli bulgu: `personel` tablosuna genel bir audit trigger eklemek güvenlik riski taşıyor

Ücret değişikliği + PIN sıfırlama ikisi de `personel` tablosunu güncelliyor — en basit çözüm gibi görünen "`personel`'e de `trg_personel_audit` (AFTER I/U/D → audit_log_yaz()) ekle" **YAPILMAMALI**: `audit_log_yaz()` tüm satırı `to_jsonb(NEW/OLD)` ile audit_log'a yazıyor, ve `personel.tc_kimlik_no` (legacy düz metin TC kimlik no — MEVCUT-DURUM §7) hâlâ bu tabloda duruyor. Genel bir trigger eklenirse **her personel güncellemesinde düz metin TC kimlik no audit_log'a kopyalanır** — tam da `personel_hassas`'ın şifrelemeyle önlemeye çalıştığı sızıntıyı audit_log üzerinden arka kapıdan açar.

**Önerilen çözüm (dar kapsamlı, manuel insert — `personel_hassas_kaydet`'teki mevcut desenle tutarlı):**

- `maasAyarlariGuncelle` akışı zaten `personel_maas_gecmisi`'ne satır ekliyor — bu tabloya (TC kimlik içermiyor, güvenli) `trg_personel_maas_gecmisi_audit` (AFTER INSERT → `audit_log_yaz()`) eklemek yeterli ve risksiz.
- `personel_puantaj_pin_belirle`/`_sifirla` RPC'lerinin İÇİNE, mevcut `personel_hassas_kaydet`'teki gibi dar kapsamlı bir `INSERT INTO audit_log (...) VALUES (..., 'pin_belirlendi'/'pin_sifirlandi', 'personel', p_personel_id, '{}'::jsonb)` eklenir — `detay` boş jsonb (hash'in kendisi bile loglanmaz).

Bu iki ekleme, `personel` tablosunun tamamını audit'lemeden, istenen iki akışı da (ücret + PIN) kapsıyor.

---

## 7. Yeni tablolarda `klinik_id` doldurma

**Karar:** `derive_klinik_id_from_parent(parent_table, parent_id_col)` deseni tekrar kullanılacak, yeni helper yazılmayacak.

Bu, **personel'e child olan** tablolar için doğrudan uygulanabilir:
- `personel_hesap_hareket` (§2.1, oluşturulursa): `trg_..._klinik_id BEFORE INSERT EXECUTE FUNCTION derive_klinik_id_from_parent('personel', 'personel_id')`

**[AÇIK SORU]** `pozisyonlar` (§1) için bu desen **uygulanamaz** — `derive_klinik_id_from_parent` bir parent SATIRDAN (`personel_id`, `terapist_id` gibi bir FK üzerinden) `klinik_id` kopyalıyor; `pozisyonlar` ise klinik'e doğrudan bağlı bir tablo (kendi `klinik_id`'sini `personel` tablosunun kendisi gibi INSERT sırasında **doğrudan** almalı, bir parent'tan türetmeye gerek yok — tıpkı `personel.klinik_id`'nin de bir trigger'la değil doğrudan INSERT payload'ında geldiği gibi). Bu madde için trigger gerekmiyor, sadece RLS `WITH CHECK (klinik_id = current_klinik_id())` yeterli.

---

## 8. Doğrulama gereksinimi (her yeni/değişen tablo için)

Talep edildiği gibi: migration'dan sonra her yeni tablo (`personel_hesap_hareket`, `pozisyonlar` — netleşirse) için

1. **En az 1 seed satırı** (test klinik üzerinde, gerçek klinik verisine dokunmadan)
2. **RLS doğrulama sorgusu** — yanlış rol/klinik ile `SELECT` denendiğinde **0 satır** döndüğünü gösteren, `SET LOCAL role authenticated` + `set_config('request.jwt.claims', ...)` ile simüle edilmiş bir psql oturumu (projenin daha önce defalarca kullandığı doğrulama metodolojisi — MEVCUT-DURUM'un referans aldığı CLAUDE.md geçmişinde onlarca örneği var)

eklenecek. `personel_hassas_getir` RPC'si için ek olarak: klinik_admin/muhasebe/personel(kendisi)/başka klinik personeli olmak üzere **4 rolle** ayrı ayrı çağrılıp beklenen sonucun (tam değer / sadece iban / maskeli / `yetkisiz`) doğrulanması gerekecek.

---

## Özet — SQL yazılmadan önce netleşmesi gereken açık sorular

**Çözüldü (2026-08-15):** `pozisyonlar` tablosunun kolon listesi kullanıcı tarafından verildi, DDL §1'e eklendi.

1. ~~`pozisyonlar` tablosunun tam şeması~~ ✅ çözüldü — ama 4 alt-nokta hâlâ açık: **(1a)** `sablon_id` yerel mi harici mi referans, **(1c)** `ucret_tipi` CHECK değer kümesi, **(1d)** `puantaj_modu` CHECK değer kümesi, **(1e)** `personel.gorev` ↔ `pozisyonlar` ilişkisi (§1)
2. `personel.rol` ile `kullanici.rol` senkronizasyonu DB trigger mı, app-layer mı (§1)
3. `personel_hesap_hareket` mevcut `personel_odeme`/`personel_ekstra_hakedis`'i birleştirip DROP mu edecek, yoksa paralel mi duracak (§2.1)
4. `personel_donem` = `personel_puantaj_donem`'in RENAME'i mi, yoksa yeni tablo mu (§2.2)
5. `iban` gerçekten yeni bir alan mı, yoksa mevcut tc_kimlik/pasaport'tan biri mi kastediliyor (§3.1)
6. `personel_hassas_maskeli_getir` (eski) ile yeni `personel_hassas_getir` bir arada mı kalacak yoksa eskisi kaldırılacak mı (§3.2)
7. `kaynak` kümesindeki `pin` değeri `self_qr`'dan farklı ne temsil ediyor (§4)

Bunlar netleşince gerçek `supabase/migrations/YYYYMMDDHHMMSS_...sql` dosyası (yukarıdaki tüm ALTER/CREATE/DROP/RPC'ler + §5'teki ayrılmış DROP bloğu) yazılabilir.

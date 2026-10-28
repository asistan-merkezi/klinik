### Modül 4 ayrıntıları (para kuralları, çift kural kararları, bütünlük, audit, performans, bulgular)

**Taşınan:** 31 dosya + hasta cari eylemleri (Modül 2'den para/idempotency yönüyle gözden geçirildi) + `islemler/actions.ts`, `paketler/actions.ts` (eski `eylemYetkisiGetir` kullanıyordu, listede görünmüyordu). Yeni: `lib/para.ts`, `lib/finans/{okuma,eylem,idempotans,tutar}.ts`, `lib/fatura/sorgular.ts`, `lib/guvenlik/gizli-sifrele.ts`, `components/panel/islem-anahtari.tsx`, migration `0012_islem_anahtari.sql`, `scripts/dev/finans-performans.mjs`, `tests/db/modul-finans.test.ts` (41 test).

#### 1. Para kuralları (kural kural) — tek tanım `lib/para.ts`

| Kural | Tanım |
|---|---|
| Temsil | JS'te tutar **kuruş (güvenli tamsayı)**; DB'ye iki ondalıklı **metin** olarak yazılır (`kurusMetni`). Drizzle `numeric` → metin gelir, `tl()` ile en çok iki ondalıklı sayıya çevrilir; toplama/çıkarma `tlTopla`/`tlFark` (kuruş) ile — `Math.round(x*100)/100` kalıpları kalktı. |
| Girdi kabulü (`lib/finans/tutar.ts`) | Nokta veya virgül, en çok **2 ondalık** (3. ondalık sessizce yuvarlanmaz, reddedilir), harf/`1e3`/boş/negatif/sıfır reddedilir (iskonto ve başlangıç tutarı gibi alanlarda boş = 0), üst sınır 9.999.999.999,99. |
| Yuvarlama | Kesirli kuruş **yarım yukarı (sıfırdan uzağa)** = Postgres `round(numeric, 2)`. Tek yerde: `kurus()` (3. ondalıktan), `yuzdeKurus()`, `kdvAyristir()`. |
| Komisyon (kredi kartı tahsilatı) | `komisyon = round(tutar × oran / 100, 2)`; hasta bakiyesi BRÜT düşer, Banka'ya **NET** (`tutar − komisyon`) yazılır. SQL (`banka_bakiye_once_toplam_tumu`) ve JS (`banka-client.tsx` → `yuzdeKurus`) aynı sonucu verir; **400 rastgele + sınır vakada SQL↔JS eşitliği testle kilitli** (`tests/db/modul-finans.test.ts`). Örnek: 1000,00 @%2,5 → 25,00 (net 975,00); 33,33 @%3,5 → 1,17 (1,16655; net 32,16). |
| KDV (**KURAL — mali müşavir teyidi bekliyor, üretim kapısı #5**) | Yuvarlama **satır/fatura bazlıdır** (her borç/fatura satırı kendi toplamından ayrıştırılır; satırlar toplanıp yeniden yuvarlanmaz) ve **yarım yukarı**dır. Tutarlar KDV DAHİL tutulur; matrah = `toplam × 100 / (100 + oran)` kuruşa **yarım yukarı**, `KDV = toplam − matrah` → **matrah + KDV her zaman toplama tam eşit**. Oran 0/boş → KDV yok. (Önceki: float, ekranda 2 ondalığa biçimleniyordu; nadir 1 kuruşluk gösterim farkı olabilir, toplam tutarsızlığı artık olamaz.) `lib/fatura/kdv-hesapla.ts` bu kuralı sarar. |
| İskonto | Borç satırı net = `tutar − iskonto_tutari` (iskonto ≥ 0, ≤ tutar; DB CHECK + RPC `iskonto_fazla`). Bakiye etkisi `−(tutar − iskonto)`. Kategori (kademe) iskontosu fiyatı **sunucuda** `islem_tanimi_etkin_fiyat()` belirler — istemci fiyat göndermez (JS kopyası `etkinFiyatHesapla` ölü koddu, silindi). Planlanan iskonto (`randevu.planlanan_iskonto_tutari`) seans bedeli işlenirken borç satırına aktarılır. |
| İade | `tur='iade'`: yöntem ZORUNLU (DB CHECK), bakiyeyi `−tutar` düşürür; Kasa/Banka/Kart'ta ÇIKIŞ. Alacağı aşan iade **engellenmez** (bakiye borca düşer) — mevcut iş kuralı korundu, bkz. §8-A. |
| Bakiye | `v_hasta_ozet.bakiye` = Σ(kredi `+tutar`; borç `−(tutar−iskonto)`; ödeme/iade yalnız `odeme_id IS NULL` olanlar `+tutar` / `−tutar`; peşin `odeme_olustur` ödemesi 0). `v_hasta_cari_ozet` ve `lib/hasta/bakiye-hareket-gorunum.ts` AYNI kuralı izler (JS yürüyen bakiyesi artık kuruş hassas; SQL ile aynı senaryo iki yerde de sabitlenmiş). |
| Gün/ay sınırı | Tüm dönem sınırları İstanbul: tarih kolonları `date`, `timestamptz` için `(tarih::timestamp at time zone 'Europe/Istanbul')`. Test: 30.09 23:30 → Eylül, 01.10 00:30 → Ekim. |

#### 2. Çift kural envanteri ve doğruluk kaynağı seçimi

| Kural | Önceki durum | **Seçilen kaynak** | Gerekçe / sonuç |
|---|---|---|---|
| Dönem özeti (gelir kırılımı, 4 gider kalemi, randevu durumu) | SQL `rapor_donem_ozeti` + JS yedek (RPC yoksa devreye giren 6 fonksiyon) | **SQL** | JS yedek **silindi** (RPC hatası artık fırlatır, eksik veriyle devam edilmez). Eski sahte-client testleri silindi; yerine gerçek Postgres karakterizasyonu. |
| Yıllık ay ay özet | SQL `rapor_yillik_ozet` + JS yedek | **SQL** | JS yolu silindi. |
| Dönem başı Kasa/Banka/Kredi Kartı bakiyesi | SQL RPC'ler (tek) | **SQL** | Zaten tek; elle hesaplı fixture ile sabitlendi (630,00 / 2.637,16 / 773,33). |
| Günlük Döküm (kalem listesi + gün toplamı) | JS (listeleme) | **JS liste, SQL toplam** | Liste SQL ile yapılamaz (kalem kalem). Gün toplamları aynı kuralı izler; **mutabakat testi**: Σ gün geliri = SQL net tahsilat, Σ gün gideri = 4 gider kalemi toplamı, Σ seans = SQL. |
| Banka komisyonu (liste satırı NET) | SQL round + JS `Math.round` | **İki kural, test kilidi** | Satır bazlı gösterim için her satıra RPC çağırmak anlamsız; JS artık `lib/para.ts`; parite testi (400 vaka). |
| Hasta bakiyesi (3 yer) | `v_hasta_ozet`, `v_hasta_cari_ozet`, JS `bakiye-hareket-gorunum.ts` | **SQL view'lar**; JS yalnız yürüyen bakiye gösterir | JS `guncelBakiye`'yi SQL'den alıp geriye yürütür; birim testi aynı senaryoyu SQL testiyle paylaşır. |
| Etkin fiyat | SQL fonksiyonu + (kullanılmayan) JS kopyası | **SQL** | JS kopyası silindi (yalnız veri şekilleri kaldı). |
| Tedarikçi anahtarı | SQL `tedarikci_anahtari()` + JS (testli) | **İki kural (zaten testli)** | Dokunulmadı; ad farklı yazılırsa ayrı cari (bilinen). |
| Geç iptal 18 saat | SQL + JS | **İki kural** | Modül 2 kapsamı, dokunulmadı. |

#### 3. Bütünlük, idempotency, kilitler

- **Atomiklik:** ödeme + kalem + satır + paket satışı + fatura kuyruğu + hasta hareketi zaten tek RPC (`odeme_olustur`, DEFINER, `paket` satırı `FOR UPDATE`). Kasa/Banka manuel hareketi, gider, kamusal ödeme, kart ödemesi tek INSERT; her biri idempotency anahtarıyla **aynı transaction'da**.
- **Çift gönderim:** `islem_anahtari (klinik_id, anahtar uuid)` tablosu (0012). Formlar `<IslemAnahtari sonuc={durum}/>` gizli alanıyla form açılışında anahtar üretir (sonuç gelince yenilenir); sunucu `islemAnahtariniKaydet` ile **ledger yazımıyla aynı tx'te** ekler, çakışma varsa yazmadan başarıyla döner. Kapsam: `odemeAl`, `bakiyeHareketiEkle`, `hastaIadesiVer`, tüm Kasa/Banka/Kart/Gider/Kamusal/Cari eylemleri. `randevu_seans_bedelini_isle` zaten doğası gereği idempotent (`zaten_islendi`). Anahtar yoksa (eski istemci) koruma uygulanmaz. Test: aynı anahtar ×3 eşzamanlı = 1 kayıt; farklı anahtar = ayrı kayıt; anahtar klinik başına benzersiz. Temizlik: 2 günden eski anahtarlar klinik başına silinebilir (DELETE politikası); **bakım betiği Modül 7'de** (`withTenant`, klinik döngüsü).
- **Eşzamanlılık:** hasta bakiyesi türetilmiştir (saklanan bakiye kolonu yok) → ödemelerde "kayıp güncelleme" mümkün değil; test: eşzamanlı iki farklı ödeme ikisi de yazılır, bakiye tam. Bakiye-bağımlı tek kural **cari ödeme**: RPC `klinik_cari_odeme_ekle` tedarikçi başına `pg_advisory_xact_lock` — test: bakiye 100, eşzamanlı iki ×60 ödeme → tam biri başarılı. Borç düzenleme `hasta_bakiye_hareket_borc_duzenle` hareket satırını `FOR UPDATE` kilitler (çift fatura yok). Paket güncelleme artık `paket` satırı kilitli + satış kontrolü aynı tx'te.
- **DB son savunma (0012, NOT VALID):** `tutar ≥ 0`, `tur≠borc ⇒ tutar > 0`, `0 ≤ iskonto ≤ tutar`. `odeme`/`odeme_kalemi`/`odeme_satiri`/`fatura`/`paket_satis` uygulama rolüne **yalnız SELECT**; `hasta_bakiye_hareket` yalnız SELECT+INSERT (UPDATE/DELETE yok; düzeltme yalnız DEFINER RPC). Testle doğrulandı.
- **DEFINER RPC'ler kendi içinde rol+tenant kontrolü yapar** (çağıranın doğruluğuna güvenmez) — doğrudan çağrı testleri: `odeme_olustur` (muhasebe/terapist `yetkisiz`, başka klinik hastası `hasta_bulunamadi`), `klinik_cari_odeme_ekle` (yalnız klinik_admin), `hasta_bakiye_hareket_borc_duzenle` (başka klinik `hareket_bulunamadi`, terapist `yetkisiz`), arşiv RPC'leri (yalnız klinik_admin), kasa/banka/kart bakiye RPC'leri (yalnız klinik_admin+muhasebe), `islem_tanimi_kaydet` (bkz. bulgu 3).

#### 4. Silme / ters kayıt (mevcut davranış korundu)

| Kayıt | Silinebilir mi | İz |
|---|---|---|
| Hasta cari defteri (`hasta_bakiye_hareket`) | **Hayır** (UPDATE/DELETE yok). Düzeltme: borçta iskonto/fatura RPC'si; ödeme hatasında yeni `iade` kaydı | audit v2 |
| `odeme`, `odeme_kalemi`, `odeme_satiri`, `fatura`, `paket_satis` | Hayır (SELECT-only) | audit v2 (fatura, paket_satis) |
| Manuel Kasa/Banka hareketi, kasa dengeleme, gider, kamusal ödeme, cari ödemesi, kart ödemesi | **Evet — yalnız klinik_admin** (eskiden de öyleydi) | audit v2 `delete` + eski değerler |
| Kart/cari tutarlılığı | Gider silme/düşürme ödemelerin altına inemez (`klinik_harcama_cari_butunluk`) | — |

Kullanıcı ilkesi "mali kayıt silinmesin, ters kayıtla yapılsın" ile **çelişen** tek küme son satırdır (yönetim giderleri/manuel hareketler); "mevcut davranışı koru" kuralı gereği değiştirilmedi, §8-D.

#### 5. Audit karşılaştırması (eski → yeni)

Denetim **veritabanı tetikleyicisiyle** (v2: `hasta_bakiye_hareket`, `fatura`, `klinik_harcama`, `kamusal_odeme`, `nakit_banka_hareketi`, `paket_satis`, `kasa_dengeleme`, `klinik_cari_odeme`, `klinik_kredi_karti_odeme`; v1: `personel_hesap_hareket`) yapıldığından uygulama taşıması izi düşüremez; yine de eylem bazında doğrulandı. Eski eylem listesi (supabase) → yeni: **hiçbir izli işlem düşmedi**; `giderEkle/Guncelle/Sil`, `kamusalOdemeEkle/Guncelle/Sil`, `kasa*`, `banka*`, `nakitBankaHareketiSil`, `kasaDengelemeEkle/Sil`, `krediKartiOdemeEkle/Sil`, `cariOdemeEkle/Sil`, `odemeAl`, `bakiyeHareketiEkle`, `hastaIadesiVer`, `borcDuzenle/finansBorcDuzenle`, arşiv içe aktarma → ilgili tabloların v2 satırı. Test: finans yazımlarından sonra 8 tablonun hepsi `audit_log`'da; manuel Kasa hareketi silinince `delete` + `surum:2` kaydı. **Kapsam dışı (eskiden de yoktu):** `paket`, `islem_tanimi` (fiyat geçmişi ayrı tabloda), `iskonto_oranlari`, `klinik_banka_hesaplari`, `islem_anahtari`. Yeni iz kaybı yok.

#### 6. Rol / yetki (test edildi)

| Rol | Yapabilir |
|---|---|
| klinik_admin | Tüm finans eylemleri (Kasa/Banka/Kart/Gider/Kamusal/Cari/Raporlar/iskonto oranları/paket/tedavi tanımı), hasta ödeme/iade/borç düzenleme |
| resepsiyon | Hasta ödeme/iade/bakiye (`odemeAl`, `bakiyeHareketiEkle`, `hastaIadesiVer`), paket satışı, fatura kesme/borç düzenleme; **Kasa/Banka/Gider yazamaz, bakiye RPC'lerini çağıramaz** |
| muhasebe | Finans defterlerini OKUR (Kasa/Banka/Kart/Raporlar bakiye RPC'leri), fatura kesme (`finansBorcDuzenle`), cari bakiye görüntüleme; **hiçbir finans yazması yok** (RLS: insert reddedilir) |
| terapist | Yönetim finansı (gider, Kasa/Banka, kamusal, cari/kart ödemeleri) **0 satır**; hasta ödeme eylemleri reddedilir. **Bilinen açık: §8-C** |

#### 7. Performans (FORCE RLS altında, 100.000 satırlık fixture, `scripts/dev/finans-performans.mjs`)

`hasta_bakiye_hareket` 100k, `klinik_harcama` 20k, `nakit_banka_hareketi` 5k, `randevu` 100k, `hasta` 2.000. Uygulama rolü + gerçek bağlam, en iyi 3 çalıştırma: `rapor_donem_ozeti` 1 ay **1,9 ms** / 1 yıl **12 ms**; `rapor_yillik_ozet` **21 ms**; `kasa_bakiye_once_toplam` **17 ms**; `banka_bakiye_once_toplam_tumu` **3 ms**; `kredi_karti_bakiye_once_toplam` **10 ms**; `klinik_cari_bakiyeler` (200 tedarikçi) **27 ms**; `v_hasta_cari_ozet` (Cari Alacaklar, 2.000 hasta) **57 ms**; Kasa sayfası aylık liste **1,5 ms**; Kesilen Faturalar aylık **1,4 ms**; Giderler (20k satır, hepsi istemciye) **24 ms**. **Yavaş (> 250 ms) sorgu yok.** Dikkat edilecekler: (1) dönem başı bakiye RPC'leri tüm geçmişi SUM'lar (O(N)); N 10 milyona çıkarsa `(klinik_id, tur, odeme_yontemi, created_at)` kısmi indeks düşünülmeli; (2) `v_hasta_cari_ozet` hasta sayısıyla doğrusal büyür (hasta başına bir döngü); (3) Giderler sayfası tüm kayıtları çeker (istemci dönem süzer) — ~100k gider üstünde sunucu tarafı süzmeye geçilmeli.

#### 8. Karar durumu (2026-10-28 güncellemesi)

Kararlar: **A** iade sınırı **UYGULANDI** (0013; bağlantılı iade + yönetici istisnası, gerekçe zorunlu, audit'te görünür; analiz: `docs/modul-4b-4c-tasarim.md` §4a) — §1'deki "alacağı aşan iade engellenmez" ifadesi artık geçersizdir (yalnız istisna iade alacağı aşabilir); **B+D → Modül 4b**, **C → Modül 4c** (taşıma sonrası, canlı öncesi; 4c = Aşama 7b'nin ilk hedefi; tasarım aynı dosyada); **E** KDV teyidi üretim kapısında (`docs/tasima-plani.md` başı). Aşağıdaki maddeler ilk analizdir:

- **A. "Ödemeden büyük iade reddi":** mevcut kural (CLAUDE.md) iadenin alacağı aşmasına izin verip uyarı verir; reddetmek iş kuralı değişikliği olduğundan **uygulanmadı**. Test mevcut davranışı belgeler (100.000 ₺ iade kabul edilir, bakiye borca düşer). İsterseniz sınır: "iade ≤ o yöntemle alınmış net tahsilat" olarak eklenir.
- **B. "İptal edilen ödemenin bakiyeyi geri alması":** ödeme iptali özelliği YOK (defter append-only; düzeltme iade kaydıyla). Ters kayıt/iptal akışı yeni özellik olur (hangi rol, onay, Kasa/Banka etkisi) — tasarım kararı bekliyor. Taksit de veri modelinde yok; karakterizasyonda ödeme, iade, paket satışı/kullanımı, iptal edilen randevu bedeli (Modül 2) kapsandı.
- **C. Terapist ve hasta cari defteri:** RLS `hasta_bakiye_hareket`, `odeme*`, `fatura`, `paket_satis` SELECT'ini klinikteki **tüm rollere** açıyor (terapist dahil); sayfa seviyesinde gizli (Cari sekmesi). Kapatmak randevu çizelgesinin "işlem kapanmış" durumunu (hareket embed'i) ve paket kalan hak göstergesini bozar → önce dar bir görünüm (`id, tur, randevu_id`) gerekir. Karar: terapist SELECT'i kapatılsın mı, hangi görünüm?
- **D. Silinebilen yönetim kayıtları** (§4): "silme yerine ters kayıt" ilkesi uygulanacaksa gider/kamusal/manuel hareket/cari ödeme için iptal-ters kayıt modeli gerekir.
- **E. KDV matrahı artık kuruşa yuvarlanıyor** (§1): önceki float görünümle nadiren 1 kuruş fark. Kabul edilebilir mi?
- **F. `klinik_cari_odeme_ekle` içindeki `− 0.005` toleransı** float döneminden kalma; numeric(12,2)'de zararsız, kaldırılabilir (DEFINER değişikliği, dokunulmadı).
- **G. 0012 CHECK'leri `NOT VALID`:** eski/arşiv verisi taşındıktan sonra `VALIDATE CONSTRAINT` çalıştırılmalı (taşıma planı adımı).

#### 9. Bulunan hatalar / sertleştirmeler

1. **Float birikimi:** istemcide `Math.round((a−b)*100)/100`, `reduce` toplamları (Kasa/Banka/Kart/Tedarikçi/Raporlar/KDV) ve paket satışında `netTutar` float'ı (`99.99−0.01` → `99.97999…` sunucuya gidiyordu) → hepsi kuruş aritmetiğine alındı.
2. **Çift gönderim:** hiçbir mali eylemde koruma yoktu → `islem_anahtari`.
3. **`islem_tanimi_kaydet` DEFINER:** adımlardaki `gerekli_cihaz_id`/`uygulayici_pozisyon_id` başka kliniğin kimliği olabilirdi (FK tenant doğrulamaz) → RPC içinde doğrulanır (0012) + eylemde de.
4. **Defterde CHECK yoktu** (negatif/sıfır tutar, tutarı aşan iskonto doğrudan INSERT'le girilebilirdi) → 0012.
5. **Sessiz başarı:** `giderGuncelle`, `kamusalOdemeGuncelle/Sil`, `cariOdemeSil`, `kasaDengelemeSil` 0 satırı etkilese de "güncellendi" dönüyordu → artık "bulunamadı".
6. **Araç/banka/kart kimlikleri** gider/kamusal ödemede FK'ye güveniyordu (araç hiç doğrulanmıyordu) → eylemde tenant doğrulaması.
7. **`paketKatilimcilariGetir`:** rol kontrolü yoktu (oturum açmış herkes) → personel rolleri.
8. **Paraşüt `client_secret` veritabanında düz metin** → AES-256-GCM (`GIZLI_VERI_ANAHTARI`, kliniğe bağlı AAD); anahtar yoksa kayıt reddedilir; hata günlüğü sorgu parametresi sızdırmaz. Bkz. `docs/kvkk-aktarim.md`.
9. **Rapor JS yedek yolu** ile SQL'in ayrışma riski (saat dilimi/yuvarlama) → yedek silindi.
10. Doğrulanan, hata çıkmayanlar: komisyon SQL↔JS paritesi (400 vaka), dönem başı bakiyeler elle hesaplı fixture ile birebir, 00:30 İstanbul sınırı, Günlük Döküm↔Rapor mutabakatı.

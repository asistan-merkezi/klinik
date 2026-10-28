# Taşıma İlerlemesi (Supabase → Drizzle + withTenant + Better Auth)

> Bu dosya `node scripts/dev/ilerleme-uret.mjs` ile üretilir (sayımlar canlı). **Durum/not düzenlemek için scripts/dev/ilerleme-uret.mjs içindeki MODULLER tablosunu değiştir.**

## NEREDEN DEVAM EDİLECEK (bir sonraki oturum için)

**Durum (2026-10-28, Modül 7 sonrası): Supabase → Windows + PostgreSQL + Better Auth taşıması KOD olarak BİTTİ. Kalan Supabase importları: 0.** Modül 1–7 tamam (Modül 7: PDF sistem Chrome'u, Resend e-posta, KVKK uyumlu mesaj içeriği + tek kullanımlık bağlantılar, kuyruk işçisi, cron→Task Scheduler betikleri, izin/kaşe belge sunumu, SSE oturum denetimi, final temizlik). Ayrıntı: Modül 7 bölümü (aşağıda) ve `docs/prova-kayit.md`.

**Sıradaki iş (kod dışı):** `docs/prova-kayit.md` provasını gerçek Windows Server VM'de koş (özellikle 9. adım uygulama duman testi, 23. adım görev hesapları + `scripts/windows/gorevleri-kur.ps1`); üretim kapıları `docs/tasima-plani.md`. DEFINER taraması (81+ fonksiyon) sonucu `docs/definer-siniflama.md` "Destek bağlamı etkisi" sütununda; 7b'nin ilk hedefi o listedir.

**Yöntem (kalıcı):** Sayfalarda `panelBaglami()` / `oturumBaglami()` + `tenantGerekli(ctx)` + `withTenant`; eylemlerde `lib/auth/yetki.ts > eylemYetkisi`; bakım işlerinde `lib/db/bakim.ts > bakimOturumuAc`. Her modül için `tests/db/modul-<ad>.test.ts` (izolasyon + rol + gerçek yazma; eylemler Next istek bağlamı istediğinden testler gerçek eylem/route kodunu oturum taklidiyle çağırır). Para: `lib/para.ts` (kuruş), mali formlarda `components/panel/islem-anahtari.tsx` (idempotency).

**Bilinçli sınırlar / açık kararlar:** bkz. kök `CLAUDE.md > Yol Haritası` ve Modül 7 "karar bekleyen" listesi.


## Özet

| # | Modül | Durum | Taşınan / Toplam | Kalan Supabase import'lu dosya |
|---|---|---|---|---|
| 1 | Kullanıcı/profil, klinik ayarları, ortak yardımcılar | **bitti** | 18 / 18 | 0 |
| 2 | Hasta ve randevu (portal, QR kayıt/anket, canlı çizelge dahil) | **bitti** | 49 / 49 | 0 |
| 3 | Muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto | **bitti** | 10 / 10 | 0 |
| 4 | Ödeme / cari / finans / paket / işlem tanımları | **bitti** | 31 / 31 | 0 |
| 5 | Personel ve puantaj (QR akışı dahil) | **bitti** | 20 / 20 | 0 |
| 6 | Destek ve yönetim (destek, chatbot, talep/şikayet, denetim geçmişi, gelmeme analizi, destek bağlamı) | **bitti** | 10 / 10 | 0 |
| 7 | Çıkış uçları: PDF, e-posta/mesaj, cron/arka plan, chatbot | **bitti** | 17 / 17 | 0 |
| | **Toplam** | | 155 / 155 | **0** |

**Kalan Supabase importları: 0**

Not: "Toplam" taşıma başlangıcındaki dosya listesidir (`scripts/dev/tasima-baslangic.txt`, 155 dosya); sayım `@supabase`, `@/lib/supabase` ve `createAdminClient` kullanan dosyaları kapsar. `lib/supabase/*` en sonda silinir.

## Modül 1 — Kullanıcı/profil, klinik ayarları, ortak yardımcılar

- Durum: **bitti**
- Not: Taşınan: lib/auth (oturum bağlamı, gecerliKullanici/gecerliHasta, yetki.ts), panel layout/actions, ayarlar (şirket bilgileri, yetkilendirme, muhasebe sync), dosya deposu (lib/dosya, logo route'ları), gece zorunlu çıkış (sunucu tarafı, ScheduledLogout silindi), oturum kilidi dosyaları silindi. KALINTI (bilinçli): lib/auth/eylem-yetkisi.ts (8 taşınmamış çağıran var) ve lib/supabase/* son modülde silinecek; yeni migration 0006 (parasut_secret_var).
- Kalan dosyalar (0): —

## Modül 2 — Hasta ve randevu (portal, QR kayıt/anket, canlı çizelge dahil)

- Durum: **bitti**
- Not: Taşındı: randevu (actions, sorgular, canlı çizelge/tablet/bildirimler sunucu verisiyle), hasta (liste, detay, actions, veri-actions), portal, QR ön kayıt/anket/iş başvurusu/seans anketi (kısa kod + anonim kapı, gizli klinik_id kalktı, lib/qr/hiz-siniri silindi), hasta belgeleri (diskte, yetkili route /api/hasta-belge/[id], imza doğrulama), arşiv içe aktarma (hasta/randevu), QR yönetimi, resmi tatiller, elle mesaj. Yeni migration: 0009 (terapist_uygunluk_getir), 0010 (hasta_kullanici INSERT), 0011 (mesaj kuyruğu INSERT + kural SELECT). KALINTI (bilinçli, sonraki modüller): lib/qr/{klinik-bilgisi,qr-kod-aktif-mi}.ts ince sarmalayıcı (puantaj, Modül 5), lib/mesaj/randevu-hatirlatma-tarama.ts + lib/tatil/oneri-uret-admin.ts (cron, Modül 7), odeme-paket arşiv sihirbazı (Modül 4), PDF route'ları (Modül 7). KARAR BEKLEYEN: (1) resmi tatil `Şimdi kontrol et` butonu artık yazmıyor (global resmi_tatil/öneri yazımı yalnız aylık betikte; kullanıcıya yazma yetkisi verilmedi); (2) elle hasta mesajı anında göndermiyor, kuyruğa alıyor (kuyruk işçisi gönderir); (3) 0011 politikaları (mesaj_kurallari SELECT + mesaj_kuyrugu INSERT, klinik_admin/resepsiyon/terapist) service-role-siniflama (b) kararının gerektirdiği dar yetkilerdir.
- Kalan dosyalar (0): —

## Modül 3 — Muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto

- Durum: **bitti**
- Not: Taşındı: kaynaklar (oda/cihaz, pasife alma kontrolü), tedavi protokolleri (protokol+adımlar tek transaction), tablet (oda seçimi, ayarlar, ekran sayfası DAR veri şekliyle), belge/foto (Modül 2'de diskte). Yeni migration yok.
- Kalan dosyalar (0): —

## Modül 4 — Ödeme / cari / finans / paket / işlem tanımları

- Durum: **bitti**
- Not: Taşındı: Kasa/Banka/Kredi Kartı, Giderler (4 sekme), Gelirler Takibi/Faturalar, Raporlar, kategori-iskonto, paketler, tedavi tanımları, ödeme-paket arşiv sihirbazı. Yeni: lib/para.ts (kuruş aritmetiği, tek yuvarlama kuralı), mali eylemlerde idempotency (0012 islem_anahtari), defter CHECK'leri, islem_tanimi_kaydet tenant doğrulaması, Paraşüt secret şifreleme. Ayrıntı ve KARAR BEKLEYEN maddeler (§8) aşağıda.
- Kalan dosyalar (0): —

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


## Modül 5 — Personel ve puantaj (QR akışı dahil)

- Durum: **bitti**
- Not: Taşındı: personel hub/detay/eylemler (hesap oluşturma = kimlik hesabı + tek tenant transaction, hata olursa kimlik hesabı geri silinir; işten çıkışta hesap devre dışı + oturumlar iptal), iş başvuruları, pozisyon tanımları, izin (talep/onay/ret/iptal, manuel izin-rapor), puantaj cetveli (gün, FM onayı, dönem kapat/aç), maaş ayarları + cari hesap + toplu ödeme (kuruş, idempotency anahtarı), QR puantaj (kısa kod → klinik, kişi oturumdan). Hakediş/maaş aritmetiği kuruşa geçti (lib/maas.ts, lib/personel/hakedis.ts; oranlaKurus yarım-yukarı). Yeni migration 0014 (izin_bildirim_alicilari, dar DEFINER). Dosyalar diskte: izin belgesi + kaşe (personel-belge) — SUNUM ROTASI YOK (UI yalnız 'yüklendi' der; PDF formu Modül 7). KALINTI: lib/personel/{donem-maasi,seans-sayisi}.ts eski supabase sürümleri (personel dönem kapama cron'u için, Modül 7). KARAR BEKLEYEN: muhasebe rolünün izin talebi bildirimi mesaj_kuyrugu INSERT politikası (0011) muhasebeyi kapsamadığı için kuyruğa yazılmıyor (best-effort). Testler: tests/db/modul-personel.test.ts (22).
- Kalan dosyalar (0): —

## Modül 6 — Destek ve yönetim (destek, chatbot, talep/şikayet, denetim geçmişi, gelmeme analizi, destek bağlamı)

- Durum: **bitti**
- Not: Taşındı: destek (ana, kılavuz, chatbot), talep-şikayetler (actions+sayfa), yonetim (ana, denetim-geçmişi, gelmeme-analizi) + YENİ super_admin yüzeyi /panel/yonetim/destek-baglami. Yeni migration 0015: destek_baglami (süre sınırlı ≤120 dk, gerekçeli, audit_log'a açılış/kapanış satırı; current_klinik_id() super_admin için YALNIZ aktif bağlamdaki kliniği döndürür → süre sınırı DB'de), klinik_uygulama için klinik_id'li her RLS'li tabloya RESTRICTIVE zorunlu_tenant_siniri politikası (166 politikadaki 'OR is_super_admin()' dalı artık klinikler arası sızdırmaz), audit_log ve destek_talebi SELECT politikalarında super_admin bypass'ı kaldırıldı, audit_detay_temizle() (maaş/TC/pasaport/IBAN/sağlık metni DEĞERLERİ yazılırken silinir; v1+v2 tetikleyicileri). Chatbot DESTEK_CHATBOT_ACIK bayrağıyla varsayılan KAPALI (kapalıyken route oturum/gövde/model'e dokunmadan 404; açıkken TC/IBAN/kart/telefon/e-posta maskelenir; app/api/destek-chatbot/route.test.ts). Klinik OLUŞTURMA web yüzeyinde yok (klinik_uygulama klinik INSERT yetkisi yok; kaynak taraması testi). createAdminClient bu modülde yok. Denetim gösterimi: lib/denetim/maskele.ts (alan adı + değer deseni). Testler: tests/db/modul-yonetim.test.ts (16, 100k satır EXPLAIN dahil), lib/denetim/gorunum.test.ts (+3), talep-listesi.test.tsx (XSS, 2), route.test.ts (9). KALINTI/KARAR: (1) talep/şikayet dosya eki özelliği YOK (eklenirse lib/dosya katmanından geçmeli; kategori eklenmeli); (2) mevcut (0015 öncesi) audit_log satırlarındaki hassas değerler DB'de durur (UPDATE yetkisi yok) — gösterimde maskelenir; (3) klinik tablosu super_admin'e tüm klinikler için SELECT açık (destek bağlamı klinik listesi için; hasta verisi içermez); (4) chatbot'u AÇMAK KVKK/hukuk kararıdır.
- Kalan dosyalar (0): —

## Modül 7 — Çıkış uçları: PDF, e-posta/mesaj, cron/arka plan, chatbot

- Durum: **bitti**
- Not: Taşındı: PDF (sistem Chrome, semafor, ağ/dosya erişimi kapalı), e-posta (Resend), KVKK uyumlu mesaj içeriği + tek kullanımlık bağlantılar (/b/[token]), kuyruk işçisi, cron route'ları → scripts/bakim (bakim_rolu + klinik başına sistem bağlamı, Task Scheduler), izin belgesi/kaşe sunumu, SSE oturum denetimi, Supabase/Vercel final temizliği. Yeni migration: 0016. Ayrıntı ve KARAR BEKLEYEN maddeler aşağıda.
- Kalan dosyalar (0): —

### Modül 7 ayrıntıları (2026-10-28)

**Ön adımlar (commit 43a1c65):** (A) `db/kontrol/bypassrls-kontrol.sql` — `klinik_id` kolonlu her RLS'li tabloda RESTRICTIVE `zorunlu_tenant_siniri` yoksa HATA (`test:db` + CI `veritabani` işi + `kontrol-calistir`); tek bilinçli istisna `destek_baglami` ve `bildirim_baglanti` (token anonim akışta tenant'sız aranır; uygulama rolü için sınır ZORUNLU, ayrı kontrol 6e). (B) 81 DEFINER taraması: `docs/definer-siniflama.md` "Destek bağlamı etkisi" sütunu; bulgu: DEFINER'lar `klinik_sahip` olarak çalıştığından PUBLIC politikalardaki `OR is_super_admin()` dalı sahibe de uygulanıyor ve destek bağlamı başka klinik verisi sızdırıyordu → 0015'te RESTRICTIVE politika `klinik_sahip`'e de uygulandı; duman testine D/E bağlamları + mutasyon kanıtı eklendi. Şimdi 89 satır: 2 yeni DEFINER (`izin_talebi_yoneticiye_bildir`, `bildirim_baglantisi_kullan`) listede, hiç SIZINTI yok. **Aşama 7b'nin ilk hedefi bu listedir** (super_admin dalı olan fonksiyonlar).

**1. PDF (commit cb7867b + bu tur):** sistem Chrome/Edge (`CHROMIUM_PATH`), en fazla 2 eşzamanlı işlem, zaman aşımı, ağ/`file://` kapalı, tenant kapılı route'lar, şablonlarda kaçışlama; `@sparticuz/chromium` paketi ve `next.config.ts` ayarları kaldırıldı.

**2. E-posta:** `lib/mesaj/eposta-resend.ts` (Resend EU, düz metin, `Idempotency-Key`), varsayılan gönderici (şifre sıfırlama gerçekten e-posta atar; yapılandırma yoksa açık hata), 28 şablon → `GENEL_MESAJ_METNI`, `lib/mesaj/icerik.ts` doğrulama, `/b/[token]` bağlantıları (0016 `bildirim_baglanti`). Test: birim (`eposta-resend.test.ts`, `icerik.test.ts`) + gerçek Resend (`eposta-resend.entegrasyon.test.ts`, `RESEND_TEST_API_KEY` yoksa atlanır — **bu oturumda anahtar olmadığından çalıştırılmadı**).

**3. Mesaj çıkış uçları:** `anlikMesajTetikle` yalnız Tx (admin sürümü silindi), klinik kimliğiyle ön ekli idempotency anahtarı, satır başına ayrı bağlantı (savepoint'te: çakışırsa bağlantı da geri alınır); kuyruk işçisi 3 adımlı (claim → HTTP dışarıda → sonuç), saatlik klinik kotası, geçici/kalıcı hata ayrımı; `izin_talebi_yoneticiye_bildir` (alıcı klinik_admin'e DB'de kilitli; 3 durumlu test `modul-mesaj-bakim.test.ts`). `izin_bildirim_alicilari` (iletişim bilgisini istemciye döndürüyordu) KALDIRILDI.

**4. Cron → scripts/bakim:** 6 betik + `lib/db/bakim.ts > bakimOturumuAc`, `lib/personel/donem-kapat.ts`, `lib/tatil/guncelleme.ts`, `lib/bakim/temizlik.ts`; `npm run bakim:derle` (esbuild), `paketle.ps1`/CI güncellendi, `scripts/windows/gorevleri-kur.ps1`. Eski `lib/personel/{donem-maasi,seans-sayisi}.ts` Supabase sürümleri silinmeden önce aynı fixture'da yeni sürümlerle karşılaştırıldı (aynı sonuç) ve altın değerlere çevrildi (`tests/db/modul-donem-kapat.test.ts`); betik çekirdeği ile elle "Dönem Kapat" kuruş kuruşa aynı hakedişi yazıyor.

**5. Belge sunumu:** `/api/personel-belge/izin/[talepId]` (talep sahibi + klinik_admin) ve `/api/personel-belge/kase/[personelId]` (yalnız klinik_admin); kayıtlı yol kalıba uymalı (tenant/kişi/uzantı) → path traversal ve çapraz-tenant yol işaretleri 404; UI "Belgeyi görüntüle" / "Kayıtlı kaşeyi görüntüle". Test: `tests/db/modul-personel-belge.test.ts`.

**6. SSE:** her 25 sn'lik ping'de oturum yeniden çözülür; geçersiz/başka kullanıcı/başka klinik/geçici şifre/çözümleme hatası → `event: oturum` + kapanış (fail-closed), istemci yeniden bağlanmaz ve sayfayı yeniler. Test: `realtime.test.ts` (birim) + `tests/db/canli-oturum.test.ts` (route).

**7. Final temizlik:** `lib/supabase/*`, `eylem-yetkisi`, `createAdminClient`, `cron-yetki`, `vercel.json`, `@supabase/*` ve `@sparticuz/chromium` paketleri silindi; eski Supabase migration geçmişi `db/arsiv/eski-migrationlar` + `eski-bekleyen` altına taşındı (yalnız `scripts/dev/yeniden-uret.mjs`/`definer-envanter.mjs` okur); kod yorumlarındaki anmalar temizlendi; CLAUDE.md yeni mimariyle yeniden yazıldı.

**KARAR BEKLEYEN:** (1) Elle hasta mesajı ve "Test Gönder" anında göndermez, kuyruğa alır (kullanıcı oturumu kuyruk satırını işleyemez); elle mesajda metin düzenlenemez (sunucu şablondan üretir). (2) Ödeme dönüşünde kredi bakiyesi `kredi-senkron` (saatlik) ile yansır; kullanıcı oturumu yerel bakiyeyi yazamaz. (3) Bağlantı yalnız giriş sayfasına yönlendirir (veri/oturum yok); tarayıcı ön izleme robotları token'ı tüketebilir — etkisi yalnız yönlendirmedir. (4) Bakım betikleri saatleri sunucu saat dilimine (Turkey Standard Time) göredir. (5) Muhasebe izin belgesini göremez (izin talepleri RLS'te yalnız yönetici/sahibe açık). (6) Kliniğin serbest şablonundaki desensiz kişisel veri (ad-soyad) koddan yakalanamaz.


## Taşırken temizlenecekler (takip)

Bkz. `scripts/dev/devam-notu.md` ve bu dosyanın modül notları. Temizlik kalemleri: QR formundaki gizli `klinik_id` alanı (tenant yalnız kısa koddan), `lib/qr/hiz-siniri.ts` (fail-closed), `ScheduledLogout`, tek oturum kilidi dosyaları (`lib/auth/oturum-kilidi.ts`, `giris-hiz-siniri.ts`), `lib/supabase/*`, `vercel.json`, `@supabase/*` paketleri.

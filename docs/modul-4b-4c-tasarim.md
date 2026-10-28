# Modül 4a/4b/4c tasarım taslakları (kodlanmadı)

Kararlar 2026-10-28. **Şimdi kodlama yok**; taşıma (Modül 5–7) bittikten sonra, canlıya çıkmadan önce yapılır. Sıra: 4b → 4c → Aşama 7b (4c, 7b'nin ilk hedefidir).

## 4a. İade sınırı (karar A) — **UYGULANDI (2026-10-28, migration 0013)**

**Kullanıcı kararı:** bağlantılı iade + istisna = yalnız klinik_admin, zorunlu gerekçe. Uygulama: `hasta_bakiye_hareket.kaynak_hareket_id / iade_istisna / iade_istisna_gerekcesi`, CHECK `hasta_bakiye_hareket_iade_kaynak_kurali` (iade ya bağlı ya gerekçeli istisna), DEFINER tetikleyici `hasta_bakiye_hareket_iade_siniri` (kaynak satırı `FOR UPDATE`; aynı klinik/hasta/yöntem[/hesap]; `iade_asimi:kalan=…`, `iade_kaynak_gecersiz`, `iade_istisna_yetkisiz`), eylem `hastaIadesiVer` (yöntem/hesap kaynaktan alınır; istisna yalnız klinik_admin), `iadeSecenekleriGetir` ve yeni iade formu. Testler: `tests/db/modul-finans.test.ts` (60+40 sınırı, eşzamanlı iki iade, geçersiz kaynak, DB seviyesi hatalar, istisna rolü/gerekçe/audit). Aşağıdaki metin analiz kaydıdır.

**Mevcut akış (incelendi):** tek yol `hastaIadesiVer` (klinik_admin + resepsiyon; form `iade-formu.tsx`). Genel `bakiyeHareketiEkle` `iade` KABUL ETMEZ. İade satırı (`tur='iade'`, `odeme_id IS NULL`, yöntem zorunlu, havale ise hesap) **hiçbir ödeme satırına bağlı değildir**; sistemde "borç-ödeme eşleştirmesi yok, tek genel bakiye" ilkesi var. Bugün tek uyarı: formda "iade sonrası bakiye" gösterimi; sunucuda sınır yok.

**İstenen kural:** iade, ilgili ödemenin tutarından önceki iadeler düşülmüş kalanını aşamaz.

**Sorun:** "ilgili ödeme" kavramı veride yok. İki uygulama yolu:
1. *Bağlantılı iade (önerilen):* `hasta_bakiye_hareket.kaynak_hareket_id uuid` (yalnız `tur='iade'`, FK + tetikleyici: aynı klinik/hasta, kaynak `tur='odeme'`, iade yöntemi = ödeme yöntemi; kalan = `kaynak.tutar − Σ(bu kaynağa bağlı iadeler)`, kaynak satırı `FOR UPDATE` kilitli → eşzamanlı iki iade aşamaz). Formda hastanın iade edilebilir ödemeleri listelenir.
2. *Hasta+yöntem tavanı:* Σödeme(yöntem[,hesap]) − Σiade(yöntem[,hesap]) ≥ 0. Bağlantı gerektirmez ama "hangi ödeme" sorusuna cevap vermez; farklı yöntemle alınmış ödeme için iade yapılamaz.

**İstisna ihtiyacı (kod incelemesinden):** muhtemelen VAR — (a) arşivden aktarılan eski ödemeler (`kaynak='arsiv'`) ve ödeme kaydı olmayan peşin tahsilatlar, (b) yanlış yöntemle girilmiş ödeme, (c) paket iptalinde `kredi` (alacak) iadesi, (d) kart/havale iadesinin farklı hesaptan yapılması. Öneri: istisna = yalnız klinik_admin, **gerekçe zorunlu** (`iade_istisna_gerekcesi`), `kaynak_hareket_id` boş + `istisna=true`, audit v2'de görünür, Raporlar'da ayrı etiket. **Bu yüzden uygulamadan önce onay isteniyor** (sorular: bağlantılı mı tavan mı; istisna olsun mu, kim onaylar; arşiv ödemeleri nasıl ele alınır).

**Testler (uygulanınca):** DB seviyesinde tetikleyici (aşan iade, kaynağın başka hastası/yöntemi, eşzamanlı iki iade), eylem seviyesinde mesajlar ve rol; mevcut "100.000 ₺ iade kabul" testi tersine çevrilir.

## 4b. Mali kayıt iptali (karar B+D)

**Amaç:** fiziksel silme yerine **iptal bayrağı + iptal eden + zaman + gerekçe**, toplamlardan düşme, gerektiğinde ters kayıt. Kapsam: hasta ödemesi (yeni özellik: ödeme iptali), `klinik_harcama`, `kamusal_odeme`, `nakit_banka_hareketi` (manuel Kasa/Banka), `klinik_cari_odeme`, `klinik_kredi_karti_odeme`, `kasa_dengeleme`.

**Tablolar:** her kayıt tablosuna ortak kolonlar `iptal_edildi boolean default false`, `iptal_eden_id uuid`, `iptal_zamani timestamptz`, `iptal_gerekcesi text` + CHECK (`iptal_edildi ⇒ üçü dolu`, gerekçe ≥ 5 karakter). İptal yalnız bir DEFINER RPC ile (`mali_kayit_iptal(p_tablo, p_id, p_gerekce)`, rol: klinik_admin; ödeme iptali için resepsiyon istisnası kararı bekliyor; tenant + kilit + idempotent). İptal geri alınamaz (yanlış iptal için yeni kayıt).
- **Hasta ödemesi:** `hasta_bakiye_hareket` append-only kalır; iptal **ters kayıt** (`tur='odeme_iptal'`, `iptal_edilen_id` UNIQUE FK, tutar pozitif, bakiye etkisi `−tutar`; Kasa/Banka/Kart defterlerinde aynı yöntem/hesapta ÇIKIŞ "Ödeme iptali"; komisyon kopyası korunur). Orijinal satır dokunulmaz; `v_hasta_ozet`, `v_hasta_cari_ozet`, `bakiye-hareket-gorunum.ts` aynı kuralı alır (3 yerde birlikte).
- **Diğerleri:** satır yerinde kalır, `iptal_edildi=true`.

**Görünümler / sorgular:** iptalli satırlar listelerde soluk + "İptal" etiketi + gerekçe (kayıt silinmez); **tüm toplamlar `iptal_edildi = false` süzer**: `rapor_donem_ozeti`, `rapor_yillik_ozet`, `kasa_bakiye_once_toplam`, `banka_bakiye_once_toplam_tumu`, `kredi_karti_bakiye_once_toplam`, `klinik_cari_bakiyeler`, `kredi_karti_borc_ozetleri`, `klinik_kredi_karti_hareketleri` görünümü, `v_hasta_*`, `lib/finans/okuma.ts`, `hesaplaGunlukDokum`, Kesilen Faturalar. Cari tutarlılığı: iptal edilen cari ödemesi bakiyeyi artırır (mevcut "sil → bakiye geri artar" ile aynı); cariye eklenmiş gider iptali ödemelerin altına düşüremez (`klinik_harcama_cari_butunluk` iptali de kapsar).
**Etkilenen raporlar:** yukarıdaki listenin tümü; Raporlar'da iptal ayrı kalem değil (toplamdan düşer), Denetim Geçmişi'nde iptal eylemi görünür.

**Yetki:** uygulama rolünden bu tablolarda **DELETE kaldırılır** (`klinik_harcama`, `kamusal_odeme`, `nakit_banka_hareketi`, `kasa_dengeleme`, `klinik_cari_odeme`, `klinik_kredi_karti_odeme`) ve DELETE RLS politikaları düşer; UPDATE yalnız iptal alanları için kolon yetkisi (gider/kamusal düzeltme kolonları ayrıca kalır). Silme eylemleri (`giderSil`, `kamusalOdemeSil`, `nakitBankaHareketiSil`, `kasaDengelemeSil`, `cariOdemeSil`, `krediKartiOdemeSil`) "iptal et + gerekçe" diyaloğuna dönüşür. Silmeye dayanan testler (`modul-finans`: Kasa silme audit testi, işlem anahtarı DELETE testi hariç) güncellenir.
**Test:** iptal sonrası her defter/rapor toplamı elle hesaplı değere iner; çift iptal tek etki; eşzamanlı iptal + cari ödeme; DELETE `permission denied`.

## 4c. Terapist finans okuma erişimi kapatma (karar C) — **UYGULANDI (2026-10-28, migration 0017)**

**Uygulama notu:** tasarımdaki iki görünüme bir üçüncüsü eklendi: `v_hasta_aktif_paket` (hasta listesindeki "kalan/toplam seans" ve randevu formundaki aktif paket seçimi terapistte de çalışsın diye; tutar yok). `v_randevu_kapanis` ayrıca `paket_kalan_adet`/`paket_ad` taşır (çizelgedeki paket göstergesi ve paket yenileme uyarısı terapist "seansı bitir" akışında çalışsın diye; adet, tutar değil). Görünümler SECURITY INVOKER DEĞİL (sahip klinik_sahip) ama kendi tenant (`current_klinik_id()`) ve personel (`current_rol() IS NOT NULL`) süzgecini taşır, `security_barrier`. `v_hasta_ozet` paket hakkını `v_hasta_paket_ozet`ten alır; `bakiye` kolonu INVOKER kalır (terapist için 0, arayüz göstermez). `RANDEVU_SELECT` eşdeğeri `lib/randevu/sorgular.ts`: gerçek cari satırı/kimliği istemciye gitmez, "işlendi" ise tek sembolik `{ tur: "borc" }`. Muhasebe okumaya devam eder; portal politikaları aynen. Kod, yeni şemayı gerektirir (eski kod terapist oturumunda boş paket/işlendi görürdü) → aynı sürüm paketi. 4b'ye dokunulmadı. Kontrol: `db/kontrol/bypassrls-kontrol.sql` 6f.

Aşağıdaki metin tasarım kaydıdır.

**Bugün:** RLS `hasta_bakiye_hareket`, `odeme`, `odeme_kalemi`, `odeme_satiri`, `fatura`, `paket_satis` için klinik içindeki **her role** SELECT veriyor. Terapist iki yerden bunlara bağımlı: (1) `RANDEVU_SELECT` içindeki `hasta_bakiye_hareket(id, tur)` embed'i → "İşlem kapanmıştır" / amber kutu, (2) `v_hasta_ozet` → `kalan_paket_hakki` (paket_satis) ve `bakiye`.
**Tasarım (dar görünümler):**
- `v_randevu_kapanis (randevu_id, klinik_id, islendi boolean, kapanis_sekli text)` — `kapanis_sekli ∈ {paketten, cariye, tahsil}`; **tutar, yöntem, hasta bakiyesi YOK**. Terapist ve diğer roller yalnız bunu kullanır; `RANDEVU_SELECT` embed'i bu görünümle değişir (`types/randevu.ts`, canlı çizelge, tablet, bildirimler). Görünüm sahibi (RLS'e tabi `klinik_sahip` + tenant politikası) üzerinden çalışır, çağıranın tenant'ı yine `current_klinik_id()` ile süzülür.
- `v_hasta_paket_ozet (hasta_id, klinik_id, kalan_paket_hakki)` — terapistin hasta listesinde/paket uyarısında gereken tek sayı. `v_hasta_ozet.bakiye` terapistten gizlenir (finans rolleri için ayrı `v_hasta_bakiye`).
- Sonra tablo politikalarında SELECT rol listesi `klinik_admin, resepsiyon, muhasebe` ile sınırlanır (terapist düşer); portal politikaları (`*_select_portal`) aynen kalır.
**Doğrulama:** terapist oturumunda bu 6 tabloda 0 satır; çizelge/tablet/bildirimler Playwright ile aynı davranışı gösterir; check-in ve seans tamamla (DEFINER RPC) bozulmaz. 4c, **Aşama 7b'nin ilk hedefi**dir.

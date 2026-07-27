# Muayene Asistanı

## Proje Özeti
Fizyoterapi kliniği için muayene yönetim SaaS'ı. Asistan Merkezi çatısı altında çoklu klinik kullanacak multi-tenant yapıda. Müşteri kaydı, randevu takibi, muayene odalarına Android tabletle anlık hasta/işlem gösterimi, terapist performans/maaş takibi, ödeme-paket yönetimi, müşteri self-servis portalı ve WhatsApp/Paraşüt entegrasyonlarını kapsar.

## Stack ve Altyapı
Next.js 16 (App Router) + TypeScript + Tailwind + Supabase + Vercel (Frankfurt), Cloudflare DNS — standart Asistan Merkezi stack'i. (Not: ilk sürümde "Next.js 14" olarak yazılmıştı; 2026-07-26'da ilk vertical slice kurulurken güncel latest sürüm (16) ile devam edilmesine karar verildi — middleware→proxy geçişi ve `useActionState`/React 19 kullanıldığını unutma.)
Projeye özgü ek entegrasyonlar:
- **Paraşüt**: resmi fatura kesimi (faturalı işlemde otomatik tetiklenir)
- **WhatsApp**: randevu, paket durumu, bakiye bildirimi — Meta (WhatsApp Business/Graph API) üzerinden kurulacak (`meta-integration` skill'i geçerli)
- **Tablet istemcisi**: Android tabletlerde native yerine Next.js PWA veya kilitli tarayıcı (kiosk mode); Supabase Realtime (WebSocket) ile sıfır gecikmeli güncelleme; offline-first (internet kesintisinde senkronizasyon queue ile çalışır)
- **Zamanlanmış işler**: Supabase Edge Functions + pg_cron (Paraşüt fatura, WhatsApp mesajları, paket expiry kontrolü)
- **UI**: Tablet/resepsiyon panelinde optimistic UI (TanStack Query) — check-in gibi aksiyonlarda gecikme hissettirilmez
- **Güvenlik**: `current_klinik_id()` tüm kritik tablolarda RLS ile zorunlu (klinik_id kolonu + auth.jwt() kontrolü); `super_admin` bypass policy'si audit_log'a yazılır; hassas müşteri verileri (TC kimlik, tam adres) pgcrypto ile şifrelenir veya ayrı `musteri_hassas` tablosunda tutulur
- **Storage**: hasta fotoğrafı/vücut haritası Signed URL + kısa expiry + virus scan (Edge Function) ile saklanır
- **Realtime**: subscription'lar oda bazlı filtrelenir (tüm klinik tek kanalda olmaz); sık sorgulanan tablolarda materialized view/cache kullanılır
- **Ödeme**: kredi kartı için İyzico veya Stripe (Türkiye), 3D Secure
- **Dayanıklılık**: Paraşüt API rate limit/downtime riskine karşı queue+retry (Edge Function + Supabase Queue); WhatsApp template red riskine karşı SMS fallback (Twilio/Turkcell)

## Veri Modeli
- `klinik` — tenant; her klinik ayrı kayıt; subdomain/custom_domain (beyaz etiket), created_at, plan_turu (starter/pro/enterprise), plan_bitis_tarihi, logo_url, marka_renkleri (JSONB)
- `kullanici` — roller kesinleşti: `super_admin` (platform yöneticisi), `klinik_admin` (klinik sahibi — finans/rapor/personel), `resepsiyon` (kayıt/randevu/ödeme/check-in/WhatsApp), `terapist` (kendi randevuları/seans notları/VAS/hakedişleri); last_active_at (aktiflik takibi)
- `personel` — tüm çalışanlar (terapist dahil): görev, maaş, ekstra ücretler, fazla mesai, rol ve yetkilendirme
- `terapist` — personelin terapist rolündeki alt kümesi; performans metrikleri (günlük/haftalık/aylık işlem) ve maaş hesaplama parametreleri burada tutulur
- `musteri` — hasta kaydı; `kvkk_onay_tarihi`, `ozel_nitelikli_veri_onay_tarihi` (sağlık verisi için ayrı rıza), `whatsapp_izin_durumu`, `dogum_tarihi`, `vergi_no`/`vergi_dairesi`/`unvan` (kurumsal hasta), `parasut_contact_id` (cari eşleme — tekrar oluşturulmaz) alanları (ilk kayıtta SMS/QR ile tek tıkla onay)
- `musteri_veli` — 18 yaş altı hasta için veli bilgisi (ad, telefon, yakınlık); onam formunda veli imzası desteklenir
- `musteri_veri_talebi` — KVKK silme/anonimleştirme talebi + durum + tarih; `klinik_ayarlar`'da `veri_saklama_suresi_yil`
- `oda` — muayene odaları; tablet cihaz eşlemesi burada
- `cihaz` — kıt fiziksel ekipman (Reformer, elektroterapi, dry needling seti, lazer vb.); `islem_tanimi`'ne bağlı `gerekli_cihaz_id`; tablet eşlemesi `device_token` + `revoked_at` ile (kayıp/çalıntı tablet uzaktan iptal edilebilir)
- `randevu` — musteri + terapist + oda + cihaz + zaman; durum alanı (planlandı/geldi-içeri alındı/iptal/gelmedi); çakışma kontrolü oda+terapist+cihaz üzerinden yapılır; `is_grup_seansi` + `max_kapasite` (bir zaman dilimine bir odada birden fazla hasta kaydı — Group Pilates, Bel-Boyun Okulu vb.; her hastanın paketinden 1'er hak düşer); `ana_terapist_id` (asıl sorumlu) ile `yapan_terapist_id` (fiilen seansı yapan) ayrımı — prim hangisine yazılacağı klinik ayarına bağlı; `recurring_id` + `recurring_pattern` (JSON) ile tekrarlayan randevu desteği (örn. haftalık Pazartesi 10:00); ana ekran canlı zaman çizelgesi bu tablodan beslenir
- `musteri_onam` — dijital tıbbi onam/rıza formu; tablet üzerinde imzalanır (ilk girişte veya riskli işlem öncesi), imza PNG/PDF olarak Supabase Storage'a (Signed URL) yüklenir
- `klinik_ayarlar` — klinik bazlı tüm konfigürasyon (JSONB veya tek satır tablo): gizlilik_modu, no_show_kural, paket_iade_kesinti_orani, maas_hesaplama_modeli, stok_uyari_esigi, varsayilan_randevu_suresi, grup_seansi_izinli_mi, onam_formu_zorunlu_islemler, features (JSONB — feature flag) — daha önce ayrı ayrı geçen klinik ayarlarını burada toplar
- `terapist_uzmanlik` — terapist ↔ uzmanlık alanı (Bel-Boyun, Spor Yaralanmaları, Nörolojik, Pediatrik vb.) many-to-many; randevu öneri motoru ve resepsiyon aramasında filtre olarak kullanılır
- `bildirim_log` — WhatsApp/SMS/Portal Push/Email gönderim durumu (gönderildi/teslim edildi/okundu/hata); retry ve escalation için
- `randevu_degisiklik_log` — iptal/erteleme/terapist-oda değişikliği tarihçesi; audit ve müşteri itirazlarında kanıt olarak kullanılır
- `vardiya_turu` — vardiya şablonları (ad, başlangıç/bitiş saati); `terapist_izin` buna referans verir
- `terapist_izin` — terapist izin/vardiya dışı saatleri; izin_turu (yıllık/hastalık/mazeret/eğitim), onay_durumu (bekliyor/onaylandı/reddedildi), onaylayan_kullanici_id; zaman çizelgesinde kapalı/gri görünür, bu aralığa randevu yazılması veritabanı kısıtıyla (constraint) engellenir; vardiya_turu şablonuyla birlikte otomatik çakışma kontrolü yapılır
- `bekleme_listesi` — slot boşalınca sıradaki bekleyen hastaya otomatik WhatsApp teklifi göndermek için
- `musteri_belge` — hasta MR/röntgen/doktor reçetesi/sevk belgesi; belge_turu, upload_tarihi, yukleyen_kullanici_id, metadata (JSONB), is_encrypted; tablet kamerasından çekilip/yüklenip hasta kartına bağlanır (Supabase Storage + Encrypted/Signed URL, max 10MB + otomatik compress); opsiyonel OCR (Tesseract.js/Google Vision) ile reçeteden işlem önerisi
- `stok_hareket` — islem_recete'nin otomatik düşümü dışında manuel stok girişleri (tedarik, fire, iade); tam envanter tarihçesi
- Materialized view'lar: `mv_terapist_performans`, `mv_klinik_doluluk`, `mv_hasta_aktiflik` (churn riski için)
- `seans_notu` — randevuya bağlı: ağrı skalası (VAS 1-10), yapılan egzersizler, sonraki seans notu, vücut haritası işaretleri (JSON — `{bolge, x, y, severity, not}`, örn. bel_l4_l5); en sık şikayet edilen 5 bölge dashboard'da gösterilir
- `islem_tanimi` — işlem adı + fiyat + KDV oranı + Paraşüt hizmet kodu + `islem_kategori` (raporlama/filtreleme için); opsiyonel `gerekli_cihaz_id`
- `islem_kategori` — işlem kategorisi (örn. Fizyoterapi ve Rehabilitasyon, Manuel Terapi, Sporcu Recovery, Estetik/Cihaz Bazlı Tedavi); raporlama ve müşteri portalı filtresinde kullanılır. Klinikte şu an uygulanan tedaviler: Fizyoterapi ve rehabilitasyon, Manuel terapi, Sporcu Recovery, G8 Terapi, Emscult Terapi, Footbalance ayak taban analizi, 3D Skolyoz Terapi (G8, Emscult, Footbalance ve 3D Skolyoz cihaz bağımlı — `cihaz` tablosunda karşılık gelen kayıtları olacak ve `islem_tanimi.gerekli_cihaz_id` ile bağlanacak)
- `islem_recete` — işlem tanımına bağlı sarf malzeme listesi (kuru iğne, kinezyo bandı, ultrason jeli vb.); her seansta otomatik stok düşümü, klinik bazlı stok uyarı eşiği, SKT kritik olanlarda batch/lot takibi
- `islem_tanimi_fiyat_gecmisi` — fiyat + KDV + geçerlilik aralığı; `odeme_satiri`'nda o anki fiyat snapshot olarak saklanır (paket iade hesabı bu snapshot'tan gider)
- `paket` / `paket_satis` — paket tanımı, geçerlilik süresi (expiry), müşteriye satılan paket + kalan adet, süre dolunca dondurma/otomatik yakma durumu; iade edilirse kullanılan seanslar tekil fiyattan düşülüp kalan tutar `musteri_bakiye_hareket`'e kredi olarak işlenir (`paket_iade_politikasi`)
- `odeme` — tahsilat kayıtları, iskonto bilgisi, faturalı/faturasız durumu; yöntem: kredi kartı / banka havalesi / nakit; parçalı ödeme desteklenir (bir `odeme` kaydına birden fazla ödeme yöntemi/tutar satırı bağlanabilir — `odeme_satiri` alt tablosu)
- `musteri_bakiye_hareket` — ledger: her satır bir hareket (ödeme/iade/kredi/borç, tutar, referans); müşteri bakiyesi bu tablodan türetilir, ayrı iade tablosu yok
- `kasa_kapanis` — günlük kasa kapama/mutabakat: tarih, personel, beklenen/sayılan tutar, fark, onay
- `fatura` — Paraşüt entegrasyon kaydı (fatura no, durum, e-Arşiv PDF linki, ödeme ile ilişki)
- `no_show_kural` — klinik bazlı ayarlanabilir: gelmedi durumunda paketten hak düşsün mü düşmesin mi
- `musteri_kullanici` — müşteri portalı girişi (şifreli); `musteri`ye 1-1 bağlı
- `audit_log` — kim, ne zaman, hangi hastanın hangi verisini gördü/değiştirdi (özellikle seans notu ve vücut haritası için kritik, KVKK)
- `sadakat_puan` — seans başına kazanılan puan, indirim/ücretsiz seans dönüşümü
- Not: abonelik modeli (aylık/3 aylık sınırsız veya kotalı) `paket` yapısının bir türü olarak ele alınacak; taksit takibi `odeme_satiri`ye vade alanı eklenerek çözülecek
- Tenant izolasyonu: `current_klinik_id()` helper fonksiyonu ile RLS (OkulCRM'deki desenle tutarlı — varsayım, teyit edilecek)

## İş Kuralları

**Randevu & Tablet**
- Randevu hem resepsiyon/sekreter panelinden hem terapist tarafından girilebilir
- Randevu takviminde sürükle-bırak + çakışma tespiti olacak; çakışma kontrolü oda + terapist + gerekli cihaz üzerinden yapılır (aynı anda iki odada aynı cihaz randevusu çakışmaz); grup seanslarında (is_grup_seansi) aynı slotta max_kapasite'ye kadar hasta kaydı yapılabilir, her hastanın paketinden 1'er hak düşer; terapist izinli/vardiya dışı saatlere veritabanı kısıtıyla randevu yazılamaz
- Randevudan 48s/24s/2s önce kademeli WhatsApp + müşteri portalı bildirimi gönderilir
- Resepsiyon "Geldi/İçeri Alındı" (check-in) durumunu seçince ilgili odanın tablet ekranı otomatik güncellenir: hasta adı + yapılacak işlem
- Tablette hasta sıra numarası gösterilir
- QR kod ile hızlı giriş: hasta randevu QR'ını okutunca tablet otomatik hastayı ve işlemi gösterir; QR+NFC kart ile check-in desteklenir
- Resepsiyon panelinde telefon numarasıyla hızlı müşteri arama olacak
- Gizlilik modu: tablette hasta soyadı maskeli gösterilebilir (örn. "Ahmet Y.") — KVKK/GDPR uyumlu, klinik/hasta bazlı açılabilir
- Tablet varsayılan olarak kiosk/salt-okunur modda çalışır; terapist not girmek veya çağrı başlatmak için 4 haneli PIN veya kendi QR kodunu okutarak oturum açar; 5 dk hareketsizlikte ekran koruyucuya döner (logo + "sıradaki hasta için hazırız")
- İlk girişte veya riskli işlem (kuru iğneleme, manuel terapi, yüksek yoğunluklu lazer vb.) öncesi tablette dijital onam/rıza formu gösterilir, hasta ekrana imza atar
- İşlem başladığında tablette geri sayım / kalan süre gösterilir
- Terapist tabletten resepsiyona dahili çağrı (malzeme/destek isteği) gönderebilir
- Offline queue çakışması: internet kesintisinde tablet/resepsiyon offline çalışır, bağlantı gelince aynı slot için çakışan kayıtlarda "resepsiyon önceliklidir" veya "ilk oluşturulan kazanır" (timestamp) kuralı uygulanır; çakışan randevular manuel reconciliation ekranında resepsiyona gösterilir
- Gelmedi (no-show) durumunda paketten hak düşülüp düşülmeyeceği `no_show_kural`'a göre belirlenir (klinik bazlı ayarlanabilir); `iptal_politikasi` ile randevudan X saat öncesine kadar ücretsiz iptal tanımlanır, sonrası hak düşer
- Grup seansına paketsiz hasta gelirse `islem_tanimi` fiyatından direkt tekil ödeme alınabilir, paket zorunlu değildir

**Seans & Klinik Notları**
- Her seans sonrası terapist paneline VAS ağrı skalası, yapılan egzersizler ve sonraki seans notu girilir (hızlı not şablonları ve sesli not/dikte ile)
- Şikayet bölgesi 2D vücut haritası üzerinde işaretlenebilir; anonimleştirilmiş "benzer vaka" önerisi sunulur
- Hasta MR/röntgen/doktor reçetesi/sevk belgesi tablet kamerasından çekilip/yüklenip hasta kartına bağlanabilir
- Tüm erişim/değişiklikler `audit_log`'a yazılır

**Ödeme & Fatura**
- Müşteride işlem seçiminde: fiyat seçimi → iskonto uygulanabilir → faturalı/faturasız sorgusu → ödeme al butonu
- Ödeme parçalı alınabilir (aynı tahsilatta birden fazla yöntem: nakit + kredi kartı vb.); yöntem seçenekleri kredi kartı, banka havalesi, nakit
- Faturalı seçilirse ödeme sonrası otomatik Paraşüt üzerinden fatura kesilir (müşterinin `parasut_contact_id`'si varsa kullanılır, yoksa oluşturulup saklanır — cari tekrar oluşmaz); fatura kesilince e-Arşiv PDF linki otomatik WhatsApp'tan müşteriye gönderilir; API hatasında queue+retry devreye girer, kesilemezse "daha sonra kesilecek" uyarısı + manuel tetikleme seçeneği sunulur
- Paket alımında her işlemde paket adedinden düşüm yapılır; paketin geçerlilik süresi dolarsa haklar dondurulur veya otomatik yakılır (klinik ayarına göre); paket biterse veya bakiye azalınca (örn. son 2 seans) yenileme teklif mesajı otomatik gönderilir
- Abonelik modeli (aylık/3 aylık sınırsız veya kotalı paket) desteklenir; taksitli ödeme takip edilir
- Paket iadesinde kullanılan seanslar tekil işlem fiyatından düşülüp kalan tutar (klinik bazlı kesinti oranı düşüldükten sonra, örn. %10) otomatik kredi olarak iade edilir veya bakiyeye aktarılır
- Sadakat puanı: her seans puan kazandırır, puanla indirim veya ücretsiz seans alınabilir

**Müşteri Portalı**
- Müşteri kendi şifresiyle giriş yapıp randevularını, paket durumunu ve bakiye durumunu görebilir; şifre sıfırlama Supabase Auth + WhatsApp/SMS OTP ile yapılır (email zorunlu değil)
- Müşteri randevu alabilir, iptal edebilir, değişiklik talep edebilir; değişiklik/iptal klinik/resepsiyon onayına tabidir (karşı onay olmadan otomatik geçmez)
- Randevu önerme motoru hasta tercihine (cinsiyet, uzmanlık alanı) göre uygun terapist/oda önerir
- Terapistin yüklediği ev egzersiz videoları ve ilerleme takibi (VAS skor grafiği, hareket açıklığı görselleri, iyileşme trendi) portalda gösterilir
- "Belgelerim" bölümünde hasta kendi MR/reçete/sevk belgelerini güvenli şekilde görüntüleyebilir

**WhatsApp**
- Randevu bildirimi etkileşimli butonludur (Geleceğim / İptal-Ertele); hasta iptal ederse zaman çizelgesinde slot boşalır veya resepsiyona uyarı düşer
- Paket durum ve bakiye bilgisi mesajları otomatik gönderilir
- WhatsApp Flows ile interaktif menü sunulur (randevumu gör / paket durumum / ödeme yap); template mesajlar Meta onayına tabidir; red riskine karşı SMS fallback (Twilio/Turkcell) hazır bulunur
- Opt-out: gelen "DUR" mesajı veya portaldan `whatsapp_izin_durumu`'nu false yapan akış olacak; `bildirim_log`'a kaydedilir

**Terapist & Personel**
- Terapist bazında günlük/haftalık/aylık işlem sayısı tutulur
- Maaş hesaplama 3 modelden birini destekler (klinik/terapist bazlı seçilir): sabit maaş; işlem başı prim (%X veya sabit ₺X); barajlı prim (belli seans sayısı üstü için bonus); nöbetçi/devir seanslarında prim ana terapiste mi seansı yapan terapiste mi yazılacağı klinik ayarıyla belirlenir
- Yol/yemek/mesai gibi ekstra hakedişler bordroya otomatik eklenir
- Personel rolüne göre yetkilendirme uygulanır (hangi rol hangi ekrana/işleme erişir)

**Analitik & Raporlama**
- Klinik dashboard: gerçek zamanlı KPI kartları (bugünkü doluluk %, bekleyen check-in, günlük tahmini ciro, aktif grup seansları), oda doluluk oranı, no-show oranı, gelir tahmini, terapist performans karşılaştırması, hasta yaşam döngüsü/churn risk tahmini, klinik sağlık skoru (doluluk+no-show+tekrar oranı), aylık karşılaştırmalı rapor (sektör ortalamasıyla)
- Muhasebe dashboard'unda günlük kasa tahsilatı, bekleyen faturalar, banka bakiyesi entegrasyonu (opsiyonel) ve günlük kasa kapanış/mutabakat ekranı (`kasa_kapanis`) olacak
- Excel/PDF rapor export (aylık ciro, KDV raporu, Paraşüt uyumlu)

## Konvansiyonlar
- Renk paleti: tasarım aşamasında `brand-ui` skill'iyle belirlenecek (klişe olduğu için "yeşil tonları" önerisi sabitlenmedi)
- Typography: Inter veya benzeri sans-serif
- Component library: Shadcn/ui + Tailwind
- Icon set: Lucide React
- Naming: TypeScript'te camelCase, DB'de snake_case

## Test & Kalite Güvencesi
- Unit test: Vitest + React Testing Library
- Integration test: Supabase
- E2E: Playwright — özellikle randevu → check-in → tablet akışı öncelikli
- Performance budget: tabletlerde 60fps hedefi

## MVP Tanımı (Sprint 1-3 sonrası)
- Temel randevu + tablet realtime
- Müşteri kaydı + basit seans notu
- Basit ödeme (faturalı/faturasız)
- Temel raporlar

**Operasyonel Detaylar**
- Resepsiyon/terapist panellerinde pg_trgm ile full-text arama olacak (ad+soyad+telefon)
- Yeni klinik onboarding akışı: varsayılan oda/cihaz/işlem tanımı şablonları otomatik yüklenir, ilk terapist ve resepsiyon kullanıcıları oluşturulur
- Paraşüt kuyruğu dolduğunda klinik_admin'e haftalık "bekleyen faturalar" raporu gönderilir; kritik hatalarda (offline sync çakışması, fatura kesilemedi) `bildirim_log` üzerinden super_admin ve ilgili klinik_admin'e Slack/Email bildirimi gider
- Yazdırılabilir PDF çıktılar: randevu kartı, seans özeti, fatura, hasta ilerleme raporu
- Karanlık mod desteği (özellikle tabletlerde uzun kullanım için)
- Her sayfada contextual yardım/bilgi butonu olacak
- Supabase Point-in-Time Recovery + haftalık manuel kritik veri export politikası uygulanacak
- Önemli endpoint'lerde (randevu oluştur, ödeme al) rate limiting olacak (Edge Functions/Vercel Middleware)
- i18n-next altyapısı baştan kurulacak (en az TR+EN — temel disiplin, tam çeviri şimdilik şart değil); WCAG 2.2 AA temel kuralları (özellikle tablet kiosk kontrast/font) baştan gözetilecek, tam denetim kapsam dışı

## Yol Haritası / Durum
Sprint 1 tamamlandı: çekirdek şema Supabase'e uygulandı (klinik, kullanıcı/rol, personel/terapist, müşteri, oda/cihaz, randevu +çakışma/kapasite/izin kontrolü, RLS, helper fonksiyonlar); `randevu` tablosu `supabase_realtime` yayınına eklendi (ayrı migration). Panelde çalışan ekranlar: giriş, randevu CRUD (liste/oluşturma/check-in-iptal), müşteri CRUD (liste/arama/oluşturma/düzenleme/KVKK onayı), oda-cihaz yönetimi (ekleme/aktif-pasif), oda bazlı tablet realtime ekranı (`/panel/tablet/[odaId]`) — check-in postgres_changes ile sayfa yenilenmeden yansıyor. Tablet ekranı bilinçli olarak MVP kapsamında: staff login arkasında, device_token/kiosk-PIN/gizlilik modu bu turda yok (kullanıcı kararıyla ertelendi, CLAUDE.md'deki "Randevu & Tablet" iş kuralları hâlâ hedef durumu tanımlıyor).
Not (teknik keşif): `@supabase/ssr` browser client'ı realtime bağlantısına oturum JWT'sini otomatik geçirmiyor; RLS'li postgres_changes için `supabase.realtime.setAuth(session.access_token)` manuel çağrılması gerekiyor, yoksa abonelik "SUBSCRIBED" görünür ama hiç event gelmez.
Sprint 2 (aktif): ödeme/paket şeması migration'a yazıldı ve uygulandı (`islem_kategori`, `islem_tanimi`, `paket`, `odeme`, `paket_satis`, `odeme_kalemi`, `odeme_satiri`, `musteri_bakiye_hareket` + RLS — fiyat kataloğunu klinik_admin yönetir, ödeme/paket_satis/bakiye hareketini klinik_admin+resepsiyon işler). Panelde İşlem Tanımları ekranı (`/panel/islemler`) tamam: liste, oluşturma, düzenleme, aktif/pasif durumu. Sıradaki: Paket tanımı CRUD ekranı, paket satış akışı (müşteriye paket satma) ve Ödeme Alma ekranı (fiyat seçimi → iskonto → faturalı/faturasız → ödeme al) — tablolar hazır ama bu üç ekran henüz yok. Ardından Paraşüt + WhatsApp entegrasyonu.
Sprint 3+ fikirleri: Terapist maaş + performans modülü + Müşteri Portalı; çok kanallı bildirim merkezi (WhatsApp/portal/e-posta/SMS), AI destekli seans önerisi, çalışan puantaj+vardiya yönetimi, beyaz etiket tema özelleştirme.
Açık sorular: WhatsApp sağlayıcı hesabı (Meta Business/numara) kurulumu yapılmadı; yüz tanıma ile check-in fikri (opsiyonel) değerlendirme aşamasında; sarf malzeme stok yönetimi kapsamı (fiziksel envanter mi, sadece uyarı mı) netleşmedi; çoklu şube modeli ertelendi — şimdilik tek şube varsayılıyor, ileride karar verilecek (öneri: şube = ayrı klinik kaydı, parent_klinik_id ile gruplama).
Onaylandı: `islem_tanimi`'ye kategori alanı eklendi; klinikte uygulanan tedaviler netleşti (Fizyoterapi ve rehabilitasyon, Manuel terapi, Sporcu Recovery, G8 Terapi, Emscult Terapi, Footbalance ayak taban analizi, 3D Skolyoz Terapi). G8, Emscult, Footbalance ve 3D Skolyoz için `cihaz` kayıtlarının açılması gerekiyor — henüz cihaz modelleri/marka bilgisi netleşmedi.

## Rakip Analizi — Özellik Gap Analizi (Medicasimple benzeri diş/klinik yazılımı plan karşılaştırması incelendi)

**Zaten karşılanıyor** (şemada/kurallarda karşılığı var, ek iş gerekmiyor): Takvim/randevu yönetimi, mobil PWA, onam formları, randevu hatırlatıcıları (WhatsApp kademeli), e-fatura (Paraşüt), self servis müşteri portalı, çoklu klinik (multi-tenant), IP/erişim kısıtlaması yerine RLS+rol bazlı yetkilendirme, hasta profilleri/dosyaları, akıllı arama (pg_trgm), hekim/terapist prim hesaplayıcı (3 model), stok yönetimi, gider tarafı kısmen (kasa_kapanis), raporlama (KPI dashboard), self check-in (QR/NFC), online randevu, beyaz etiket (subdomain/custom_domain), CRM/3.parti entegrasyon altyapısı kısmen (Paraşüt, WhatsApp).

**Gerçek eksikler — değerlendirilecek/eklenecek:**
- **E-Nabız Entegrasyonu**: T.C. Sağlık Bakanlığı sistemine hasta verisi/rapor paylaşımı; fizyoterapi kliniği için mevzuat açısından önemli olabilir — araştırılmalı, kapsam netleşince `api-integration` skill'iyle planlanacak
- **Recall otomasyonu**: belirli süredir gelmeyen/paketi biten hastaya otomatik "geri kazanım" mesajı — `bekleme_listesi`den farklı, ayrı bir otomasyon (örn. `mv_hasta_aktiflik` churn view'ından beslenebilir)
- **Randevu Anketi Otomasyonu**: seans sonrası memnuniyet anketi (WhatsApp/portal üzerinden)
- **İtibar Yönetimi**: memnun hastadan otomatik Google/harita yorumu isteme akışı
- **Fırsat Raporları**: bitmek üzere olan paket/yenileme potansiyeli olan hasta listesi (satış fırsatı raporu — mevcut "paket biterse yenileme teklif mesajı" iş kuralının raporlama tarafı eksik)
- **Hasta Segmentleri**: pazarlama amaçlı hasta gruplama (örn. şikayet bölgesi, sadakat seviyesi, son ziyaret) — kampanya/toplu mesaj hedeflemede kullanılabilir
- **Online Ödeme Linki / SMS-QR ile Ödeme**: mevcut ödeme akışı kliniğe fiziksel gelişi varsayıyor; uzaktan ödeme linki (WhatsApp/SMS ile gönderilen ödeme linki) eksik — `payment-integration` skill kapsamında değerlendirilecek
- **Gider Modülü / Ön Muhasebe Modülü**: şu an sadece `kasa_kapanis` var; genel gider takibi (kira, malzeme alımı, personel dışı harcama) ve basit ön muhasebe raporu yok
- **Çok Dilli Tedavi Planı**: i18n genel arayüz için planlı ama hasta tedavi planı/raporunun çok dilli çıktısı ayrı bir ihtiyaç (yabancı hasta senaryosu)
- **Özel SMS Başlığı / Özel E-posta Alan Adı**: beyaz etiket kapsamına bildirim gönderici kimliği (sender ID/domain) eklenmemiş
- **API Erişimi (dış geliştiriciye)** / **Zapier & Make Entegrasyonu**: şu an sadece dahili entegrasyonlar (Paraşüt, WhatsApp) planlı; üçüncü taraf otomasyon platformlarına açık API yok
- **Üçüncü Taraf Santral (çağrı merkezi) Entegrasyonu**: gelen çağrıda otomatik hasta kartı açma — küçük klinik için düşük öncelik, not olarak bırakıldı

**İlgisiz (atlanacak)**: incelenen ürün diş kliniği odaklı olduğundan "Diş Şeması", "Laboratuvar Vaka Takibi" gibi diş hekimliğine özgü maddeler Muayene Asistanı kapsamı dışında (fizyoterapi eşdeğeri zaten `seans_notu`'ndaki vücut haritası ile karşılanıyor).

Bu gap analizindeki maddeler henüz sprint'e alınmadı — önceliklendirme kullanıcıyla birlikte yapılacak.

## İş Modeli Notları
- SaaS fiyatlandırması klinik büyüklüğüne göre kademeli olacak (1-3 / 4-8 / 9+ terapist); beyaz etiket seçeneği düşünülüyor
- Asistan Merkezi çatısı altında kliniklerden anonimleştirilmiş veri toplayıp pazarlama amaçlı sektör istatistik raporu çıkarma fikri var
- İleride React Native ile terapist+hasta mobil uygulaması düşünülüyor (PWA temelinden native'e geçiş)

Son güncelleme: 2026-07-27 (sprint 2: ödeme/paket şeması + İşlem Tanımı ekranı tamamlandı)

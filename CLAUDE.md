# Klinik Asistanı

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
- **Güvenlik**: `current_klinik_id()` tüm kritik tablolarda RLS ile zorunlu (klinik_id kolonu + auth.jwt() kontrolü); `super_admin` bypass policy'si audit_log'a yazılır; hassas müşteri verileri (TC/pasaport no, adres, acil durum, tıbbi geçmiş) ayrı `musteri_hassas` tablosunda tutulur — pgcrypto kolon şifrelemesi YOK (kullanıcı kararı: izolasyon RLS + Supabase disk-seviyesi şifrelemeyle sağlanıyor, anahtar yönetimi karmaşıklığı MVP'de gereksiz görüldü)
- **Storage**: hasta fotoğrafı/vücut haritası Signed URL + kısa expiry + virus scan (Edge Function) ile saklanır
- **Realtime**: subscription'lar oda bazlı filtrelenir (tüm klinik tek kanalda olmaz); sık sorgulanan tablolarda materialized view/cache kullanılır
- **Ödeme**: kredi kartı için İyzico veya Stripe (Türkiye), 3D Secure
- **Dayanıklılık**: Paraşüt API rate limit/downtime riskine karşı queue+retry (Edge Function + Supabase Queue); WhatsApp template red riskine karşı SMS fallback (Twilio/Turkcell)

## Veri Modeli
- `klinik` — tenant; her klinik ayrı kayıt; subdomain/custom_domain (beyaz etiket), created_at, plan_turu (starter/pro/enterprise), plan_bitis_tarihi, logo_url, marka_renkleri (JSONB)
- `kullanici` — roller kesinleşti: `super_admin` (platform yöneticisi), `klinik_admin` (klinik sahibi — finans/rapor/personel), `resepsiyon` (kayıt/randevu/ödeme/check-in/WhatsApp), `terapist` (kendi randevuları/seans notları/VAS/hakedişleri); last_active_at (aktiflik takibi)
- `personel` — tüm çalışanlar (terapist dahil): görev, maaş, ekstra ücretler, fazla mesai, rol ve yetkilendirme
- `terapist` — personelin terapist rolündeki alt kümesi; maaş hesaplama parametreleri (`maas_hesaplama_modeli`, `prim_sabit_tutar`, `baraj_seans_sayisi`, `baraj_bonus_tutari`) burada tutulur
- `personel_ekstra_hakedis` — bordroya eklenen yol/yemek/mesai/diğer ek hakedişler; personel + tarih + tutar
- `musteri` — hasta kaydı; `kvkk_onay_tarihi`, `ozel_nitelikli_veri_onay_tarihi` (sağlık verisi için ayrı rıza), `ticari_ileti_onay_tarihi` (SMS/e-posta kampanya, `whatsapp_izin_durumu`dan ayrı), `whatsapp_izin_durumu`, `dogum_tarihi`, `cinsiyet`, `eposta`, `referans_kanali`, `vergi_no`/`vergi_dairesi`/`unvan` (kurumsal hasta — henüz eklenmedi, Paraşüt turunda), `parasut_contact_id` (cari eşleme — tekrar oluşturulmaz) alanları (ilk kayıtta SMS/QR ile tek tıkla onay)
- `musteri_hassas` — TC/pasaport no (`kimlik_no`+`kimlik_no_tipi`, klinik bazlı UNIQUE), adres, acil durum kişisi (ad/yakınlık/telefon), tıbbi ön geçmiş (kronik hastalıklar, sürekli ilaçlar, alerjiler, geçirilmiş ameliyatlar, geliş sebebi); `musteri_id` 1-1 PK, `klinik_id` INSERT trigger ile `musteri`den türetilir
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
- `musteri_kullanici` — müşteri portalı girişi; `id` = `auth.users.id`, `musteri_id` 1-1, `aktif` (erişim uzaktan kapatılabilir)
- `randevu_iptal_talebi` — müşterinin portaldan gönderdiği randevu iptal talebi; `durum` (bekliyor/onaylandı/reddedildi), `klinik_id` trigger ile randevu'dan türetilir
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
Sprint 2 tamamlandı: ödeme/paket şeması + `odeme_olustur` RPC fonksiyonu (bkz. not) migration'a yazıldı ve uygulandı (`islem_kategori`, `islem_tanimi`, `paket`, `odeme`, `paket_satis`, `odeme_kalemi`, `odeme_satiri`, `musteri_bakiye_hareket` + RLS). Panelde tamam olan ekranlar: İşlem Tanımları (`/panel/islemler`), Paketler (`/panel/paketler`), müşteri listesinden erişilen Müşteri Detay + Ödeme Al (`/panel/musteriler/[id]`) — tekil işlem veya paket satışı, parçalı ödeme (nakit/kart/havale karışık), iskonto, faturalı/faturasız, ödeme geçmişi ve aktif paket listesi. Ödeme tam tutarda olmalı (kısmi/taksitli ödeme kapsam dışı — vade alanı ileride); `musteri_bakiye_hareket` şimdilik sadece audit-trail (her ödeme `tur='odeme'` yazar), "bakiye" kavramı (kredi/borç netleşmesi) henüz UI'da yok.
Paraşüt fatura kuyruğu kuruldu (`fatura` tablosu + `odeme_olustur`'a faturali=true'da otomatik `fatura` satırı ekleyen genişletme, migration `20260727150000`): Ödeme Geçmişi'nde her faturalı ödemede durum rozeti (bekliyor/kesildi/hata) + "Faturayı Kes" butonu (`faturaTetikle` action). **Henüz gerçek Paraşüt hesabı/API kimlik bilgisi yok** — buton şu an sabit "Paraşüt bağlantısı henüz kurulmadı" mesajı dönüyor, `fatura.durum` 'bekliyor' kalıyor (bilinçli erteleme: resmi API dokümantasyonu bu ortamdan doğrulanamadı — apidocs.parasut.com bot korumasından 403/404 döndü, GitHub wrapper README'leri de endpoint/alan adlarını netleştirmeye yetmedi; doğrulanmamış varsayımlarla client yazmak yerine gerçek hesap/doküman gelince yazılacak). `.env.local`'da `PARASUT_CLIENT_ID`/`SECRET`/`COMPANY_ID` yorum satırı olarak placeholder var. `musteri` tablosuna `vergi_no`/`vergi_dairesi`/`unvan`/`parasut_contact_id` kolonları da bilinçli olarak henüz eklenmedi — gerçek client yazılırken birlikte eklenecek (şimdiden şemayı şişirmemek için). Sıradaki: gerçek Paraşüt client'ı (hesap/dokümantasyon netleşince) + WhatsApp entegrasyonu (o da hesap/numara kurulumu bekliyor).
Not (teknik keşif): Bu sandbox'tan Supabase Postgres'ine doğrudan bağlantı (`supabase db push --db-url`) IPv6 kısıtlaması ve yanlış pooler domaini (`.co` değil `.com` olmalı, örn. `aws-0-eu-central-1.pooler.supabase.com`) yüzünden başarısız oluyordu; doğru pooler host + port 5432 (session mode, 6543 transaction-mode "prepared statement already exists" hatası veriyor) ile migration'lar buradan da push edilebiliyor — artık Dashboard SQL Editor'e elle yapıştırmaya gerek yok.
Not (teknik keşif): Base UI `Select`, değer programatik set edildiğinde (düzenleme formu, submit sonrası) `items` prop'u verilmeden ham value/UUID gösteriyor — yeni her Select kullanımında `items={liste.map(x => ({ value: x.id, label: x.ad }))}` eklenmeli, yoksa etiket bozuk görünür (veri doğru kaydedilir, sadece görünüm bozuk).
Not (mimari): Uygulamada ilk kez çoklu tablo yazan bir işlem (`odeme_olustur`) gerektiği için Postgres RPC fonksiyonu (plpgsql, SECURITY DEFINER) kullanıldı — önceki tüm mutasyonlar tek tablo insert/update'ti (randevu çakışması bile DB exclusion constraint + tek insert ile çözülüyor). Gelecekte benzer çok-tablolu atomik ihtiyaçlarda (örn. paket iade akışı) aynı RPC deseni izlenmeli.
Terapist Maaş + Performans modülü tamamlandı (migration `20260727180000`): `terapist`e prim/baraj kolonları, `personel_ekstra_hakedis` tablosu (yol/yemek/mesai/diğer) + RLS eklendi. Panel: `/panel/personel` (liste) ve `/panel/personel/[id]` (terapist için gün/hafta/seçili-ay tamamlanan seans sayısı, maaş breakdown, maaş ayarları formu ve hakediş ekleme klinik_admin'e açık, kendi verisini görme terapistin kendisine açık). Prim hesabı bilinçli olarak SEANS SAYISI bazlı (sabit ₺X/seans veya baraj-üstü bonus) — `odeme_kalemi` herhangi bir randevu/terapiste bağlı değil (ödeme müşteri bazında alınır, seans bazında değil), bu yüzden ciro yüzdesi (%X) prim modeli bu turda kapsam dışı (kullanıcı kararı); gerekirse ileride `odeme_kalemi`ye `randevu_id` eklenerek çözülebilir.
Detaylı Müşteri Kaydı tamamlandı (migration `20260727210000` + düzeltme `20260727220000`): `musteri`ye cinsiyet/eposta/referans_kanali/ozel_nitelikli_veri_onay_tarihi/ticari_ileti_onay_tarihi, yeni `musteri_hassas` tablosu (kimlik no+tipi UNIQUE, adres, acil durum kişisi, tıbbi geçmiş) + RLS eklendi. İki aşamalı kayıt (kullanıcı isteği): Hızlı Kayıt (`/panel/musteriler` formu) sadece ad-soyad + telefon + kimlik no/türü + WhatsApp/ticari ileti onayı alır (10 saniyelik akış); Detaylı Bilgiler (adres, acil durum, tıbbi geçmiş) Müşteri Portalı'ndan (`/portal/bilgilerim`) müşterinin kendisi doldurur — resepsiyon fallback'i olarak Müşteri Detay'da da aynı form düzenlenebilir (`klinik_admin`/`resepsiyon`). Sağlık verisi alanları (kronik hastalık/ilaç/alerji/ameliyat/geliş sebebi) `ozel_nitelikli_veri_onay_tarihi` rızası olmadan kaydedilmez — form sessizce atlar, kullanıcıya "rıza kutucuğunu işaretleyin" mesajı döner; rıza hem portaldan (checkbox) hem panelden ("kağıt form imzalandıysa" butonu, KVKK onayıyla aynı desen) verilebilir. **Bulunan/düzeltilen hata**: portal migration'ında (`20260727200000`) `musteri` tablosuna sadece SELECT policy'si eklenmişti, UPDATE unutulmuştu — portaldan cinsiyet/eposta/rıza güncellemeleri RLS tarafından sessizce (hatasız, 0 satır) engelleniyordu; `20260727220000` ile düzeltildi. Ders: RLS INSERT/SELECT/UPDATE/DELETE dörtlüsü her yeni tablo/akışta tek tek kontrol edilmeli, "SELECT var" yeterli sanılmamalı.
Müşteri Portalı (temel) tamamlandı (migration `20260727200000`): `musteri_kullanici` + `randevu_iptal_talebi` tabloları, `current_musteri_id()` helper, mevcut tablolara (musteri/randevu/paket/paket_satis/odeme/odeme_kalemi/odeme_satiri/musteri_bakiye_hareket/terapist/personel/oda) additive "kendi verisi" SELECT policy'leri. Giriş yöntemi bilinçli olarak WhatsApp/SMS OTP DEĞİL (sağlayıcı hesabı yok, Paraşüt'teki gibi aynı blokaj): resepsiyon/klinik_admin Müşteri Detay'dan "Portal Erişimi Aç" ile geçici şifre üretir (`auth.admin.createUser` + sentetik e-posta `m-{musteri.id}@portal.local`, kullanıcıya asla gösterilmez/gönderilmez), müşteri `/portal/giris`de TELEFON + şifreyle girer (`portal_giris_epostasi` SECURITY DEFINER RPC telefonu sentetik e-postaya çevirir, anon çağırabilir). Kapsam bilinçli olarak GÖRÜNTÜLEME + iptal talebi ile sınırlı (kullanıcı kararı): `/portal` — aktif paketler, yaklaşan/geçmiş randevular, ödeme geçmişi, "İptal talep et"; randevu alma/değişiklik talebi bu turda yok. İptal talebi müşteriden direkt randevu satırını değiştirmez (RLS'te sütun bazlı kısıt yok) — ayrı `randevu_iptal_talebi` tablosuna INSERT eder, resepsiyon `/panel/randevular`daki "Bekleyen İptal Talepleri" kartından onaylar (randevu.durum='iptal' olur) veya reddeder. Panel ve portal aynı Supabase Auth cookie'sini paylaşır; `/portal/page.tsx` kendi içinde `musteri_kullanici` satırı var mı diye ayrıca doğrular (personel bir şekilde portale girerse veri görmez, RLS zaten engeller, ama sayfa da nazikçe `/portal/giris`e döner).
Sprint 3+ fikirleri: çok kanallı bildirim merkezi (WhatsApp/portal/e-posta/SMS), AI destekli seans önerisi, çalışan puantaj+vardiya yönetimi, beyaz etiket tema özelleştirme.
Açık sorular: WhatsApp sağlayıcı hesabı (Meta Business/numara) kurulumu yapılmadı; yüz tanıma ile check-in fikri (opsiyonel) değerlendirme aşamasında; sarf malzeme stok yönetimi kapsamı (fiziksel envanter mi, sadece uyarı mı) netleşmedi; çoklu şube modeli ertelendi — şimdilik tek şube varsayılıyor, ileride karar verilecek (öneri: şube = ayrı klinik kaydı, parent_klinik_id ile gruplama).
Onaylandı: `islem_tanimi`'ye kategori alanı eklendi; klinikte uygulanan tedaviler netleşti (Fizyoterapi ve rehabilitasyon, Manuel terapi, Sporcu Recovery, G8 Terapi, Emscult Terapi, Footbalance ayak taban analizi, 3D Skolyoz Terapi). G8, Emscult, Footbalance ve 3D Skolyoz için `cihaz` kayıtlarının açılması gerekiyor — henüz cihaz modelleri/marka bilgisi netleşmedi.
Geri alındı (2026-07-28): Tedaviler ekranındaki kategori bölümü kaldırıldı — `islem_kategori` için hiç oluşturma ekranı yapılmamıştı, bu yüzden `islem_kategori_id` NOT NULL zorunluluğu yeni tedavi eklemeyi tamamen engelliyordu (migration `20260728140000` ile kolon nullable yapıldı). `islem_kategori` tablosu ileride raporlama/filtre için durabilir ama şu an hiçbir ekrandan yönetilmiyor/gösterilmiyor. Aynı turda "İşlem Tanımları" ekranı "Tedavi Tanımları" olarak yeniden adlandırıldı (başlık, "Tedavi Adı" etiketi, "Yeni Tedavi Tanımı"); Paraşüt Hizmet Kodu alanı formdan kaldırıldı (kolon DB'de duruyor, kullanılmıyor) — muhasebe tarafında artık sadece `muhasebe_hizmet_ismi` kullanılıyor ve bu alan Tedavi Adı yazılırken otomatik aynı değerle dolup, kullanıcı elle değiştirince senkronizasyon kesiliyor (hem ekleme hem düzenleme formunda).

## Rakip Analizi — Özellik Gap Analizi (Medicasimple benzeri diş/klinik yazılımı incelendi)

Zaten karşılanıyor: Takvim/randevu, mobil PWA, onam formları, kademeli WhatsApp hatırlatıcı, e-fatura (Paraşüt), müşteri portalı, multi-tenant, RLS+rol bazlı yetkilendirme, hasta profilleri, pg_trgm arama, 3 model prim hesaplayıcı, stok yönetimi, kısmi gider takibi (kasa_kapanis), KPI dashboard, QR/NFC self check-in, online randevu, beyaz etiket, kısmi 3.parti entegrasyon (Paraşüt, WhatsApp).

Gerçek eksikler (henüz sprint'e alınmadı, önceliklendirme kullanıcıyla yapılacak):
- E-Nabız entegrasyonu (mevzuat açısından araştırılmalı, kapsam netleşince `api-integration`)
- Recall otomasyonu: paketi biten/uzun süredir gelmeyen hastaya otomatik mesaj (`bekleme_listesi`den ayrı; `mv_hasta_aktiflik` churn view'ından beslenebilir)
- Seans sonrası memnuniyet anketi otomasyonu
- İtibar yönetimi: memnun hastadan otomatik Google/harita yorumu isteme
- Fırsat raporu: bitmek üzere olan paket/yenileme potansiyeli olan hasta listesi
- Hasta segmentleri (pazarlama amaçlı gruplama — şikayet bölgesi, sadakat, son ziyaret)
- Online ödeme linki / SMS-QR ile ödeme (`payment-integration`)
- Gider/ön muhasebe modülü (şu an sadece kasa_kapanis var)
- Çok dilli tedavi planı/rapor çıktısı (yabancı hasta senaryosu)
- Beyaz etikette özel SMS başlığı/e-posta alan adı
- Dış geliştiriciye API erişimi / Zapier-Make entegrasyonu
- Çağrı merkezi entegrasyonu (düşük öncelik)

İlgisiz: diş hekimliğine özgü maddeler (Diş Şeması, Lab Vaka Takibi) kapsam dışı — fizyoterapi eşdeğeri `seans_notu` vücut haritasıyla zaten karşılanıyor.

## İş Modeli Notları
- SaaS fiyatlandırması klinik büyüklüğüne göre kademeli olacak (1-3 / 4-8 / 9+ terapist); beyaz etiket seçeneği düşünülüyor
- Asistan Merkezi çatısı altında kliniklerden anonimleştirilmiş veri toplayıp pazarlama amaçlı sektör istatistik raporu çıkarma fikri var
- İleride React Native ile terapist+hasta mobil uygulaması düşünülüyor (PWA temelinden native'e geçiş)

Müşteriler ekranına elle doldurulacak, yazdırılabilir "Kayıt Formu (PDF)" eklendi (`/panel/musteriler/kayit-formu`): PDF üretimi için ayrı kütüphane eklenmedi (bilinçli — proje henüz hiç PDF üretim altyapısı kurmamıştı), bunun yerine tarayıcı `window.print()` + "PDF olarak kaydet" akışı kullanılan print-ready bir sayfa yapıldı; alanlar `musteri`/`musteri_hassas`/`musteri_veli` şemasıyla birebir (kimlik-iletişim, veli bilgisi, acil durum kişisi, tıbbi ön geçmiş, KVKK/rıza onay kutuları). Sidebar'ı print sırasında gizlemek için paylaşılan `sidebar.tsx`'e dokunmak yerine sayfaya özel inline `<style>` kullanıldı (o dosyada aynı anda başka bir oturumun tema/tasarım değişikliği sürüyordu, çakışmasın diye).

Son güncelleme: 2026-07-28 (Kayıt Formu PDF, Tedavi Tanımları ekranı yeniden adlandırıldı, kategori zorunluluğu kaldırıldı, Paraşüt Hizmet Kodu formdan çıkarıldı; önceki turlardan Detaylı Müşteri Kaydı + Müşteri Portalı temel sürümü, Terapist Maaş + Performans, sprint 2, Paraşüt fatura kuyruğu)

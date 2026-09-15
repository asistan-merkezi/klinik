# Klinik Asistanı

## Proje Özeti
Fizyoterapi klinikleri için multi-tenant muayene/klinik yönetim SaaS'ı; Asistan Merkezi çatısı altında. Kapsam: hasta kaydı, randevu/çizelge, muayene odalarında tablet ile anlık hasta-işlem gösterimi, seans notu + 2D vücut haritası, cari/paket/ödeme, personel (izin-puantaj-hakediş), hasta portalı, QR self-servis akışları, mesajlaşma (SMS/WhatsApp/Mail) ve Paraşüt.

İş modeli: klinik büyüklüğüne göre kademeli SaaS (1-3 / 4-8 / 9+ terapist), beyaz etiket opsiyonu düşünülüyor. İleride React Native ile terapist+hasta mobil uygulaması.

**İlgili dosyalar**: `app/(app)/panel/personel/CLAUDE.md` (personel modülü detayı) · `docs/DESIGN.md` (tasarım spesi) · `docs/TUZAKLAR.md` (tuzakların gerekçesi) · `docs/DEGISIKLIK-GUNLUGU.md` (tur-tur geçmiş arşivi, oturumda okunmaz).

## Stack ve Altyapı
Standart Asistan Merkezi stack'i + **Next.js 16** (App Router, React 19, `useActionState`, middleware→proxy geçildi) + Tailwind v4. Vercel (Frankfurt), Cloudflare DNS, Supabase.

- **Paraşüt**: şema/kuyruk hazır, **gerçek hesap ve API kimliği YOK** — `faturaTetikle` sabit "bağlantı kurulmadı" döner, `fatura.durum='bekliyor'` kalır. `.env.local`'da yorumlu placeholder.
- **Mesajlaşma**: SMS/WhatsApp/Mail hepsi TEK merkez ucundan (`mesaj.asistanmerkezi`, ayrı proje) — `lib/mesaj/merkez-client.ts`; kanal başına adapter mimarisi kaldırıldı. Merkez servisi henüz yok (env placeholder). Dosya başındaki "MERKEZ SÖZLEŞMESİ" bloğu merkezin 4 zorunluluğunu tanımlar: idempotency, versiyon geri gitmeme, bilinen hata kodları, ödeme referansı doğrulama.
- **Cron** (`vercel.json`): `mesaj-kuyruk-isle` 5 dk, `kredi-senkron` saatlik. `CRON_SECRET` Bearer ile doğrulanır — **aynı değer Vercel env'ine de girilmeli**, yoksa prod'da hep 401. Hobby planında 5 dk sıklık reddedilebilir (plan teyit edilmedi).
- **PDF**: `puppeteer-core` + `@sparticuz/chromium`, `lib/pdf/browser.ts` (Vercel'de paket binary'si, yerelde `PUPPETEER_EXECUTABLE_PATH`). Şablonlar Tailwind KULLANMAZ — düz TS string + inline style (`lib/pdf/form-sablon-cekirdegi.ts`, `pdf-yardimcilari.ts`). Tuzaklar aşağıda.
- **Tablet**: PWA/kiosk, Supabase Realtime; salt-okunur (PIN/device_token/gizlilik modu bilinçli ertelendi).
- **Kart ödemesi** (İyzico/Stripe + 3DS): henüz kurulmadı.

## Veri Modeli
Kolon dökümü migration'larda; burada yalnız tablo amacı ve migration'dan okunamayan kararlar var.

Tenant izolasyonu `current_klinik_id()` + RLS, kritik tablolarda `klinik_id`; portal için `current_hasta_id()`. `super_admin` bypass'ı `audit_log`'a yazılır. Alt tablolarda `klinik_id` generic `derive_klinik_id_from_parent()` trigger'ıyla türetilir, denetim `audit_log_yaz()` ile.

**Roller**: `super_admin`, `klinik_admin`, `resepsiyon`, `terapist`, `muhasebe` (dar kapsam: fatura kesme + bordro salt-okunur; hasta/randevu/personel yönetimi ve hassas veri bilinçli kapalı). Merkezi yetki fonksiyonu YOK — her sayfa kendi `rol IN (...)` kontrolünü tekrarlar (bkz. Teknik Borç).

- **Klinik**: `klinik` · `kullanici` · `klinik_ayarlar` (tüm konfig tek jsonb `ayarlar`: gizlilik modu, no-show, features, `qr_kodlari`, tablet ayarları — read-modify-write ile güncellenir).
- **Hasta**: `hasta` (kategori vita/plus/elit/prime; KVKK + özel nitelikli veri + ticari ileti onayları AYRI kolonlar; `kayit_kanali` resepsiyon|qr_self_servis; `risk_bayraklari`) · `hasta_hassas` (1-1; kimlik/adres/acil kişi/veli + 9 tri-state tıbbi ön geçmiş bayrağı; **pgcrypto YOK** — izolasyon RLS + disk şifrelemesiyle, kullanıcı kararı) · `hasta_veli` · `hasta_iliski` · `hasta_sigorta` · `hasta_kullanici` (portal girişi) · `hasta_anamnez` · `hasta_veri_talebi`.
- **Klinik veri**: `seans_notu` · `hasta_vucut_haritasi_isareti` · `hasta_protokol` (kontrendikasyon kontrolü DB trigger'ında) · `tedavi_protokolu`/`_adimi` (katalog; hastaya atama akışı yok) · `olcek_tanimi`/`hasta_olcum` (VAS/ROM/QuickDASH/Oswestry/Berg/SF-36 — telifli ölçek madde metinleri BİLİNÇLİ boş) · `egzersiz_kutuphanesi` + ev egzersiz zinciri · `randevu_checklist` · `islem_kontrendikasyon`.
- **Belge**: `hasta_belge` (3 kategori: radyoloji|klinik_foto|dokuman; klinik_foto'da `onam_id` NOT NULL; soft delete) · `hasta_onam` (append-only, `imza_storage_path` nullable = kağıt form fallback'i). Storage `hasta-belge` bucket, path `{klinik_id}/{hasta_id}/{kategori}/{belge_id}.{ext}`, `storage.objects` üzerinde RLS. Terapist yükler+görür, silemez.
- **Randevu**: `randevu` (8 durum: planlandi/geldi/gecikmeli_geldi/seansta/iptal/gelmedi/ertelendi/tamamlandi; oda+terapist+cihaz exclusion constraint; grup seansı; `ana_terapist_id` vs `yapan_terapist_id`; tekrarlayan randevu; `kaynak` uygulama|arsiv) · `randevu_iptal_talebi` · `randevu_talebi` (portaldan) · `randevu_degisiklik_log` · `bekleme_listesi` · `oda` · `cihaz` · `seans_degerlendirme` (randevu_id UNIQUE).
- **Finans**: `islem_tanimi` (`vita_fiyat` master/zorunlu + plus/elit/prime opsiyonel override) · `iskonto_oranlari` (klinik başına tek satır) · `islem_tanimi_fiyat_gecmisi` (trigger) · `islem_recete`/`stok_hareket` · `paket` (`satis_bitis_tarihi` = TANIMIN satışa açık son günü, hastayla ilgisiz; `kisi_kotasi`) · `paket_satis` (**tarih bazlı geçerlilik YOK**, sadece `kalan_adet`/`durum`) · `odeme`/`odeme_kalemi`/`odeme_satiri` · `hasta_bakiye_hareket` (tek defter + `iskonto_tutari`) · `kasa_kapanis` · `fatura` · `klinik_harcama` · `sadakat_puan`.
- **Personel** (detay: modül CLAUDE.md'si): `personel` · `personel_hassas` (TC/pasaport `pgp_sym_encrypt`; anahtar `ALTER DATABASE ... SET app.settings.encryption_key` ile elle kurulur, migration'a GÖMÜLMEZ; düz metin client'a dönmez, `personel_hassas_maskeli_getir` son 2 haneyi verir) · `personel_acil_kisi` · `personel_mesleki_belge` · `terapist` (prim/baraj) · `personel_hesap_hareket` (TEK cari defter; `hakedis` yalnız dönem kapanışında, elle eklenemez) · `personel_ucret` (append-only) · `personel_izin_talebi` · `personel_puantaj` · `pozisyonlar`/`pozisyon_sablonlari` (9 şablon, yeni klinikte trigger seed) · `vardiya_turu`/`personel_vardiya_atama` · `resmi_tatil` · `is_basvurusu` (beklemede/olumlu/olumsuz, PDF formuyla birebir alanlar).
- **Mesajlaşma**: `mesaj_kurallari` (tetikleyici kataloğu DB'de DEĞİL kodda: `lib/mesaj/tetikleyiciler.ts`, 27 adet; seed YOK, satır yoksa "pasif") · `mesaj_kredileri` (defter değil, **merkez bakiyesinin yerel yansıması**, `merkez_bakiye_versiyonu` guard'ı) · `mesaj_kredi_hareketleri` (yalnız `'yukleme'`) · `mesaj_kuyrugu` (aynı zamanda log).
- **Diğer**: `audit_log` · `bildirim_log`/`hasta_iletisim_log` · `destek_talebi` · `anket_yaniti` · `no_show_kural` · `islem_kategori` (nullable, yönetim ekranı yok) · `hasta_hedef`/`v_hasta_karsilastirma` (UI kaldırıldı, şema duruyor).
- **View**: `v_hasta_ozet`, `v_hasta_detay_ozet`, `v_hasta_cari_ozet`, `v_hasta_karsilastirma`, `v_personel_bilgi_durumu`, `v_personel_izin_bakiye` + `mv_terapist_performans`/`mv_klinik_doluluk`/`mv_hasta_aktiflik`/`mv_hasta_ilerleme` (matview RLS desteklemez → ham matview client rollerinden REVOKE edildi, daima üstündeki view sorgulanır).

**Kritik RPC'ler** (SECURITY DEFINER): `odeme_olustur` · `randevu_gelis_isaretle` · `islem_tanimi_etkin_fiyat(islem_id, hasta_id)` — **fiyat/iskonto tamamen sunucuda, istemci asla fiyat göndermez** (yalnız `ref_id`+`miktar`) · `hasta_bakiye_hareket_borc_duzenle` · `hasta_belge_goruntule` · `hasta_qr_self_servis_mi` · `qr_kodu_aktif_mi` · `portal_giris_epostasi` · `personel_puantaj_pin_*` · `personel_hesap_hareket_donem_ekle` · `mesaj_kredi_senkronla` · `*_arsiv_ice_aktar` (klinik_admin-only).

## İş Kuralları

**Randevu & Tablet**
- Çakışma kontrolü oda + terapist + cihaz üzerinden (DB exclusion constraint). Grup seansında `max_kapasite`'ye kadar hasta, her birinden 1 hak düşer. İzinli/vardiya dışı saate randevu yazılamaz.
- Check-in ilgili odanın tabletine anlık yansır. Paketsiz check-in otomatik **borç** satırı yazar; paketli check-in en eski satın alınan paketten düşer (FIFO, `satis_tarihi ASC`). No-show'da hak düşüp düşmeyeceği `no_show_kural`'a bağlı.
- Tablet salt-okunur; oda boşken günün son tamamlanan seansının anket QR'ı görünür, yeni check-in'de kaybolur.
- Hedef ama henüz yok: kademeli 48s/24s/2s hatırlatma, QR/NFC check-in, gizlilik modu, tablette dijital onam imzası, offline reconciliation.

**Cari — borç/ödeme modeli** (üç kez yeniden tasarlandı, geçerli olan bu)
- **Borç**: seans tamamlanınca veya paket satışında `tur='borc'` satır. Satıra tıklanınca İskonto (₺) + Faturalı girilir; satır HER ZAMAN `tur='borc'` kalır — "kapama"/"ödendi" kavramı YOK, istenildiği kadar tekrar düzenlenir. Bakiye etkisi `-(tutar - iskonto_tutari)`.
- **Ödeme**: bağımsız kavram — `tur='odeme'`, `odeme_id=NULL`, bakiyeyi doğrudan `+tutar` azaltır. **Borç-ödeme eşleştirmesi YOK**, tek genel bakiye.
- Faturalı ilk işaretlemede `odeme`+`odeme_kalemi`+`odeme_satiri`(nakit)+`fatura` oluşup borç satırına bağlanır; sonraki düzenlemelerde yeni fatura açılmaz, mevcut güncellenir.
- Paket satışı peşin ödeme DEĞİL, borç olarak işlenir (`odeme_olustur` paket-only çağrıda hiç `odeme` yaratmaz). `islem` kalemli çağrılar eski peşin davranışı korur (panelde canlı çağıranı yok).
- Paket kişi kotası dolunca YENİ kişiye satış reddedilir (`kota_doldu`); daha önce almış biri her zaman yenileyebilir — "Yenile" normal satış akışıdır, ücretsiz sıfırlama yolu bilinçli yazılmadı. İadede kullanılan seanslar tekil fiyattan düşülür, kalanı kesinti sonrası krediye geçer.

**Hasta verisi & yetki**
- Sağlık verisi alanları `ozel_nitelikli_veri_onay_tarihi` rızası olmadan kaydedilmez (form sessizce atlar, kullanıcıya mesaj döner). Rıza portaldan checkbox veya panelden "kağıt form imzalandıysa" butonuyla verilir.
- Terapist `hasta`'da yalnız `risk_bayraklari`, `hasta_hassas`'ta yalnız anamnez kolonlarını değiştirebilir (DB trigger'ıyla zorlanır). **İdari alanlar (ad/telefon/kimlik/adres) ile klinik alanlar AYRI form + AYRI action'da tutulur** — bir arada tutmak, idari alana bağlı herhangi bir kısıtın anamnez kaydını da sessizce reddetmesine yol açıyor (üç kez tekrarladı).
- İki aşamalı kayıt: Hızlı Kayıt resepsiyonda; Detaylı Bilgiler portaldan hastanın kendisi (resepsiyon fallback'i var). "Kim hangi belgeyi gördü" logu `hasta_belge_goruntule` RPC'siyle, yalnız gerçek açma anında yazılır.

**QR / anonim akışlar** (4 statik: Hasta Ön Kayıt, Anket, Puantaj Giriş/Çıkış + 1 dinamik seans anketi)
- Gerçek `anon` role. Blast radius: `hasta` anon INSERT policy'si `kayit_kanali='qr_self_servis' AND kvkk_onay_tarihi IS NOT NULL` şartlı; `hasta_hassas` yalnız bu kanaldan gelen hastaya bağlanabilir. **anon'a hiçbir SELECT policy'si verilmedi** (PII enumeration riski) — dedup yok, 23505 kullanıcı dostu mesaja çevrilir.
- Aç/kapa `klinik_ayarlar.ayarlar.qr_kodlari` ile; anahtar yoksa varsayılan **açık**. Kapalı QR'ın public formu kayıt kabul etmez.
- Puantaj PIN'i 6 hane (isim seçilmediği için tüm havuza karşı deneniyor), `crypt()`/`gen_salt('bf')` tek yönlü hash; personel kendi belirler, yönetici yalnız sıfırlar.
- **Kabul edilmiş kısıt**: bu public route'larda rate limiting YOK (QR'lar klinik binasına asılıyor).

**Hasta Portalı**
- Giriş telefon + şifre (OTP DEĞİL — sağlayıcı yok). Resepsiyon "Portal Erişimi Aç" ile 6 haneli geçici şifre üretir (sentetik e-posta `m-{hasta.id}@portal.local`, gösterilmez). Kişisel QR yalnız telefonu önceden doldurur, şifresiz giriş yok.
- Kapsam görüntüleme + **talep**: iptal ve randevu talebi ayrı tablolara INSERT eder, resepsiyon onaylar — hasta randevu satırını doğrudan değiştiremez. "Son değişiklik" satırında personel adı hastaya gösterilmez.

**Personel** (detay: `app/(app)/panel/personel/CLAUDE.md`)
- Tek giriş noktası bir İŞ BAŞVURUSUNU onaylamak; doğrudan personel oluşturma kaldırıldı. "Olumlu" bir durum güncellemesi değil, önceden doldurulmuş sihirbazı açar; aynı başvurudan iki kez personel oluşturulamaz.
- Maaş 3 model: sabit / işlem başı prim / barajlı prim. Prim **seans sayısı** bazlı (ciro yüzdesi kapsam dışı — `odeme_kalemi` randevuya bağlı değil). Hakediş formülü TEK dosyada: `lib/personel/hakedis.ts`. Yıllık izin hakkı kıdem+yaştan, yalnız `tip='yillik'` düşer.

**Arşiv içe aktarma** (klinik_admin-only, Excel/CSV): satır bazlı hata toleranslı — her satır kendi `BEGIN/EXCEPTION` alt bloğunda, sonuç `{satir_no, durum, sebep}`. Ödeme importu `odeme_olustur`'u ÇAĞIRMAZ, `fatura` kuyruğuna satır eklemez, KVKK/rıza tarihlerini set ETMEZ. Hasta importunda dedup var, randevu/ödemede yok. `xlsx` (SheetJS) bilinçli kullanılmadı (yamasız yüksek önemli açıklar) → `exceljs`.

## Konvansiyonlar
- Renk/tipografi kaynağı `docs/DESIGN.md` + `app/globals.css`. Font: Plus Jakarta Sans.
- Shadcn/ui + Base UI + Tailwind; ikon Lucide React.
- TypeScript camelCase, DB snake_case. Kod/DB/UI dili Türkçe (dosya ve fonksiyon adları dahil).
- Çok-tablolu atomik işlemler daima Postgres RPC (plpgsql, SECURITY DEFINER); uygulama katmanında zincirlenmez.

## Tasarım Sistemi
Panelin tüm ekranları `docs/DESIGN.md`'ye geçirildi (2026-09-09). Yeni ekran yazarken `/panel/tasarim-galerisi`'ni referans al (girişli herkese açık, sidebar'a bilinçli link konmadı).

- **Token**: panel kodunda hardcoded hex / `slate-*` / `cyan-*` YASAK — semantic token (`bg-card`, `text-muted-foreground`, `border-border`) veya `lib/ui/durum-tonlari.ts`'teki `StatusTone`. **Bilinçli istisnalar** (temizlemeye kalkma): `components/tablet/*`, `lib/tablet/*`, `/panel/tablet/*`, `/tablet-onizleme` (ayrı kurumsal palet) · `lib/pdf/*` (Tailwind yok) · `vucut-haritasi.tsx` VAS renkleri (tıbbi standart) · `yillik-grafik.tsx` CVD-güvenli palet · `randevu-kutusu.tsx` `TEDAVI_PALETI` · `icon-tile.tsx` kategorik tonlar · `app/(marketing)`.
- **Renk rolleri**: `--primary` #1E40AF açık / #2563EB koyu (AA için bilinçli DESIGN sapması) · `--clinical` teal #0F766E+beyaz / #14B8A6+koyu metin · `--clinical-accent` #0D9488 yalnız metinsiz kullanımda · `--secondary` shadcn nötr semantiğinde kalır, teal ondan ayrı tutulur.
- **Radius tuzağı**: DESIGN'ın "lg"si (1rem) ile Tailwind'in `--radius-lg`'si (0.5rem) çakışıyor. Konteyner köşesi için `rounded-lg` YAZMA → `rounded-2xl`. Card=`rounded-2xl`, Dialog=`rounded-3xl`.
- **Zorunlu bileşenler**: sayfa başlığı elle `<header><h1>` değil `PageHeader`; durum rengi daima `StatusBadge` + `durum-tonlari.ts` (yerel renk haritası yazma); boş liste `EmptyState` (`compact` prop'u var); tablolar `components/ui/table.tsx`; sayısal hizalı alanlarda `.tabular`.
- **Bilinçli sapmalar**: buton padding DESIGN'a taşınmadı (150+ çağrı yeri `h-8` skalasına bağımlı); koyu tema primary AA için değiştirildi.

## Bilinen Tuzaklar (başlıklar)
Hepsi bu projede gerçekten yaşandı, bir kısmı birden çok kez. **Gerekçeler ve doğrulama yöntemleri: `docs/TUZAKLAR.md` — ilgili alana dokunmadan önce aç.**

- **RLS**: INSERT/SELECT/UPDATE/DELETE dörtlüsü tek tek kontrol edilir · `.insert().select()` SELECT policy'sine de tabidir (anon'da id'yi `crypto.randomUUID()` ile sunucuda üret) · policy içindeki `EXISTS` de çağıranın RLS'ine tabidir → `SECURITY DEFINER` helper.
- **PostgREST**: VIEW'larda embed (`.select("...hasta(ad)")`) SESSİZCE boş döner — ayrı çekip `Map`'le birleştir.
- **Postgres**: pgcrypto `extensions` şemasında → RPC'lerde `SET search_path = public, extensions` · pooler host `.com` + port 5432 · `is_super_admin()` service-role'de false döner, `auth.role()` de kontrol edilmeli · SELECT trigger yok.
- **Next.js**: hub rotasını ALT rotasından `revalidatePath` etmek `isPending`'i sonsuza kadar takıyor (yalnız alt→üst tehlikeli) · `@supabase/ssr` realtime'a JWT geçirmez, `realtime.setAuth()` şart · dinamik SVG içinde `<title>` çocuğu hydration mismatch verir → `aria-label` · `react-hooks/set-state-in-effect` aktif, `useEffect`+`setState` yerine `useQuery`/`useMemo` · Base UI `Select`'te `items` prop'u şart · route handler'larda `react-dom/server` çalışmaz.
- **Tailwind**: `variant="outline"` üstüne renk bindirirken `!important` şart ve `next build` çıktısından doğrulanmalı (3 kez yanılttı) · sabit yükseklik + `items-center` + `overflow-y-auto` içeriği yukarı taşırır, `items-start` kullan · responsive eklerken `lg:` önekini unutma.
- **PDF/Puppeteer**: `puppeteer-core` ↔ `@sparticuz/chromium` aynı Chrome milestone'unda ve `--save-exact` sabit (şu an 25.1.0 ↔ 149.0.0) · **yeni PDF route'unu `outputFileTracingIncludes` + `vercel.json > functions`'a eklemeyi unutma**, yoksa prod'da "Could not find Chromium" · `headless:"shell"` · font ve emoji gömülü olmalı (Lambda'da sistem fontu yok) · `setContent`, `goto` değil.
- **Süreç**: "ekranda mantıklı görünüyor" ≠ doğrulandı. Geçerli yöntem: psql oturum simülasyonu (`SET LOCAL role authenticated` + `request.jwt.claims` + ROLLBACK) ve geçici test klinik + Playwright ile gerçek giriş · `npm run lint` baseline'ı sabit değil (7/9/11), o anki değeri ölç.

### Teknik Borç: Sidebar rol görünürlüğü
`sidebar.tsx`'teki `TERAPISTE_GORUNMEYEN_GRUPLAR` ile sayfa taraflı `rol IN (...)` kontrolleri senkron tutulmuyor; sayfaya yeni kısıt eklenip sidebar güncellenmezse link görünüp tıklayınca redirect yiyen eski soruna dönülür. Kalıcı çözüm: merkezi route→izinli-rol eşlemesi.

## Test & Kalite Güvencesi
Vitest + RTL (unit), Supabase (integration), Playwright (e2e — randevu → check-in → tablet akışı öncelikli). Tabletlerde 60fps hedefi. Her tur sonunda `npx tsc --noEmit` + `npm run lint` + `next build` temiz olmalı.

## Yol Haritası / Durum
**Çalışır durumda**: randevu/çizelge + check-in + oda tableti (realtime) · hasta CRUD + Hasta Detay 4 route'lu hub (`/kisisel`, `/randevu`, `/tedavi` — içinde 2 iç-sekme: Tedavi & Anamnez + Gelişim & Ölçümler; `/cari` terapiste kapalı) · belge/foto yükleme (tek POST `/api/hasta-belge/foto-yukle`, Canvas+WebP 1280px/%85) · cari borç-ödeme · paketler (kota + katılımcı + yenile) · tedavi tanımları + kademeli fiyat/iskonto · personel modülü · hasta portalı · 4 QR akışı + seans anketi · arşiv içe aktarma · mesajlaşma Faz 1-2 + merkez istemcisi · 2 PDF formu · Destek/Talep-Şikayet · tasarım sistemi geçişi.

**Sıradaki**
1. Mesajlaşma Faz 3-4: gerçek merkez servisinin bağlanması + 27 tetikleyicinin kod tabanına bağlanması + günlük tarama cron'u. (Faz 4 veri boşlukları `tetikleyiciler.ts`'te `baglanmaNotu` alanında işaretli.)
2. Gerçek Paraşüt client'ı — hesap/doküman gelince; `hasta`'ya `vergi_no`/`vergi_dairesi`/`unvan` o turda eklenecek.
3. WhatsApp Business hesabı/numarası kurulumu.

**Açık maddeler**
- PDF route'larının gerçek Vercel/Lambda'da çalıştığı **canlıda teyit edilmedi** (sandbox Windows). `.nft.json` kanıtı dosyaların bundle'a girdiğini gösteriyor, fonksiyonun çalıştığını değil.
- Cron'ların Vercel plan limitine takılıp takılmadığı ve `CRON_SECRET`'in Vercel env'ine girilip girilmediği teyit edilmeli.
- Şemada/kodda duran ama hiçbir UI'dan erişilmeyen kalıntılar (bilinçli, geri alınabilir): `islem_kategori` · `hasta_hedef` · `v_hasta_karsilastirma` · `paket_satis.gecerlilik_bitis_tarihi` · `personel.ozel_yetki_override` · `/panel/personel/maas`+`/takip`.
- Telifli ölçek metinleri (QuickDASH/Oswestry/Berg/SF-36) resmi kaynaktan girilmeli. 27 tetikleyicinin KVKK hizmet/ticari sınıflandırması hukuk onayı bekliyor.
- Cihaz kayıtları (G8, Emscult, Footbalance, 3D Skolyoz) açılmadı — marka/model netleşmedi.
- Çoklu şube ertelendi (öneri: şube = ayrı klinik, `parent_klinik_id` ile gruplama). Sarf stok kapsamı netleşmedi.

**Rakip-gap backlog'u** (sprint'e alınmadı): E-Nabız · recall otomasyonu · seans sonrası anket otomasyonu · Google yorum isteme · fırsat raporu · hasta segmentleri · online ödeme linki · gider/ön muhasebe · çok dilli rapor · beyaz etikette özel SMS başlığı · dış API/Zapier · çağrı merkezi.

Son güncelleme: 2026-09-13

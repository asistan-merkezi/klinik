# Taşıma İlerlemesi (Supabase → Drizzle + withTenant + Better Auth)

> Bu dosya `node scripts/dev/ilerleme-uret.mjs` ile üretilir (sayımlar canlı). **Durum/not düzenlemek için scripts/dev/ilerleme-uret.mjs içindeki MODULLER tablosunu değiştir.**

## NEREDEN DEVAM EDİLECEK (bir sonraki oturum için)

**Durum (2026-10-27, oturum 1):** Aşama 4 ön adımları tamam (damgalı bağlam, Playwright giriş duman testi 9/9, ilerleme dosyası). Modül 1 başlıyor. `docs/tasima-plani.md` içindeki "tenant'ı DB tarafında türetme" önerisi (A/B/C) kullanıcı kararı bekliyor — modül taşıma mevcut damgalı bağlamla ilerliyor, A sonradan eklenirse uygulama kodu değişmez.
**Yöntem:** `eylemYetkisiGetir` (eski, supabase döndürür) taşınmamış modüller için KALIYOR; taşınan modüller yeni `eylemYetkisi` (bağlam döndürür) kullanır. Son modülde eski sürüm silinir. `gecerliKullanici()` yeni kimlik katmanına bağlandı (aynı dönüş şekli).


## Özet

| # | Modül | Durum | Taşınan / Toplam | Kalan Supabase import'lu dosya |
|---|---|---|---|---|
| 1 | Kullanıcı/profil, klinik ayarları, ortak yardımcılar | **sürüyor** | 0 / 19 | 19 |
| 2 | Hasta ve randevu (portal, QR kayıt/anket, canlı çizelge dahil) | **bekliyor** | 0 / 48 | 48 |
| 3 | Muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto | **bekliyor** | 0 / 10 | 10 |
| 4 | Ödeme / cari / finans / paket / işlem tanımları | **bekliyor** | 0 / 31 | 31 |
| 5 | Personel ve puantaj (QR akışı dahil) | **bekliyor** | 0 / 20 | 20 |
| 6 | Kalan modüller (destek, yönetim, vb.) | **bekliyor** | 1 / 10 | 9 |
| 7 | Çıkış uçları: PDF, e-posta/mesaj, cron/arka plan, chatbot | **bekliyor** | 0 / 17 | 17 |
| | **Toplam** | | 1 / 155 | **154** |

Not: "Toplam" taşıma başlangıcındaki dosya listesidir (`scripts/dev/tasima-baslangic.txt`, 155 dosya); sayım `@supabase`, `@/lib/supabase` ve `createAdminClient` kullanan dosyaları kapsar. `lib/supabase/*` en sonda silinir.

## Modül 1 — Kullanıcı/profil, klinik ayarları, ortak yardımcılar

- Durum: **sürüyor**
- Kalan dosyalar (19):
  - `app/(app)/panel/ayarlar/muhasebe-sync/actions.ts`
  - `app/(app)/panel/ayarlar/muhasebe-sync/page.tsx`
  - `app/(app)/panel/ayarlar/page.tsx`
  - `app/(app)/panel/ayarlar/sirket-bilgileri/actions.ts`
  - `app/(app)/panel/ayarlar/sirket-bilgileri/page.tsx`
  - `app/(app)/panel/ayarlar/yetkilendirme/actions.ts`
  - `app/(app)/panel/ayarlar/yetkilendirme/page.tsx`
  - `app/(app)/panel/layout.tsx`
  - `app/(app)/panel/page.tsx`
  - `lib/auth/eylem-yetkisi.ts`
  - `lib/auth/gecerli-hasta.ts`
  - `lib/auth/gecerli-kullanici.ts`
  - `lib/auth/oturum-kilidi.ts`
  - `lib/supabase/admin.ts`
  - `lib/supabase/client.ts`
  - `lib/supabase/middleware.ts`
  - `lib/supabase/sayfali-okuma.ts`
  - `lib/supabase/server.ts`
  - `components/scheduled-logout.tsx`

## Modül 2 — Hasta ve randevu (portal, QR kayıt/anket, canlı çizelge dahil)

- Durum: **bekliyor**
- Not: canli-cizelge/randevu-bildirimleri realtime (Aşama 6).
- Kalan dosyalar (48):
  - `app/(app)/anket/seans/[randevuId]/actions.ts`
  - `app/(app)/anket/[kisaKod]/actions.ts`
  - `app/(app)/kayit/hasta/[kisaKod]/actions.ts`
  - `app/(app)/panel/ayarlar/arsiv-ice-aktarma/hastalar/actions.ts`
  - `app/(app)/panel/ayarlar/arsiv-ice-aktarma/randevular/actions.ts`
  - `app/(app)/panel/ayarlar/arsiv-ice-aktarma/randevular/page.tsx`
  - `app/(app)/panel/ayarlar/qr-kodlar/actions.ts`
  - `app/(app)/panel/ayarlar/qr-kodlar/anket-yanitlari/page.tsx`
  - `app/(app)/panel/ayarlar/qr-kodlar/page.tsx`
  - `app/(app)/panel/ayarlar/resmi-tatiller/actions.ts`
  - `app/(app)/panel/ayarlar/resmi-tatiller/page.tsx`
  - `app/(app)/panel/hastalar/actions.ts`
  - `app/(app)/panel/hastalar/bildirimler/actions.ts`
  - `app/(app)/panel/hastalar/bildirimler/bildirim-sayisi.ts`
  - `app/(app)/panel/hastalar/bildirimler/page.tsx`
  - `app/(app)/panel/hastalar/kayit-formu/page.tsx`
  - `app/(app)/panel/hastalar/page.tsx`
  - `app/(app)/panel/hastalar/[id]/actions.ts`
  - `app/(app)/panel/hastalar/[id]/cari/page.tsx`
  - `app/(app)/panel/hastalar/[id]/hasta-getir.ts`
  - `app/(app)/panel/hastalar/[id]/kisisel/page.tsx`
  - `app/(app)/panel/hastalar/[id]/layout.tsx`
  - `app/(app)/panel/hastalar/[id]/mesaj-actions.ts`
  - `app/(app)/panel/hastalar/[id]/page.tsx`
  - `app/(app)/panel/hastalar/[id]/protokol-karti.tsx`
  - `app/(app)/panel/hastalar/[id]/queries.ts`
  - `app/(app)/panel/hastalar/[id]/randevu/page.tsx`
  - `app/(app)/panel/randevular/actions.ts`
  - `app/(app)/panel/randevular/page.tsx`
  - `app/(app)/panel/randevular/queries.ts`
  - `app/(app)/portal/actions.ts`
  - `app/(app)/portal/bilgilerim/page.tsx`
  - `app/(app)/portal/page.tsx`
  - `app/(app)/portal/randevu-talep/page.tsx`
  - `app/api/hasta-arama/route.ts`
  - `lib/hasta/arama.ts`
  - `lib/qr/hiz-siniri.ts`
  - `lib/qr/klinik-bilgisi.ts`
  - `lib/qr/qr-kod-aktif-mi.ts`
  - `lib/qr/seans-anket-baglami.ts`
  - `lib/randevu/tedavi-secenekleri.ts`
  - `lib/randevu/terapist-uygunluk.ts`
  - `lib/tatil/durum.ts`
  - `lib/tatil/oneri-uret.ts`
  - `components/hasta/aktif-paket-satiri.tsx`
  - `components/panel/canli-cizelge.tsx`
  - `components/panel/randevu-bildirimleri.tsx`
  - `components/panel/randevu-detay-paneli.tsx`

## Modül 3 — Muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto

- Durum: **bekliyor**
- Not: Realtime (tablet) SSE + LISTEN/NOTIFY gerektirir (Aşama 6); belge/foto dosya katmanı gerektirir (Aşama 5).
- Kalan dosyalar (10):
  - `app/(app)/panel/hastalar/[id]/belgeler/actions.ts`
  - `app/(app)/panel/hastalar/[id]/belgeler/queries.ts`
  - `app/(app)/panel/kaynaklar/page.tsx`
  - `app/(app)/panel/tablet/ayarlar/actions.ts`
  - `app/(app)/panel/tablet/ayarlar/page.tsx`
  - `app/(app)/panel/tablet/page.tsx`
  - `app/(app)/panel/tablet/[odaId]/page.tsx`
  - `app/(app)/panel/tablet/[odaId]/tablet-ekrani.tsx`
  - `app/(app)/panel/tedavi-protokolleri/page.tsx`
  - `app/api/hasta-belge/foto-yukle/route.ts`

## Modül 4 — Ödeme / cari / finans / paket / işlem tanımları

- Durum: **bekliyor**
- Kalan dosyalar (31):
  - `app/(app)/panel/ayarlar/arsiv-ice-aktarma/odeme-paket/actions.ts`
  - `app/(app)/panel/ayarlar/arsiv-ice-aktarma/odeme-paket/page.tsx`
  - `app/(app)/panel/finans/banka/actions.ts`
  - `app/(app)/panel/finans/banka/page.tsx`
  - `app/(app)/panel/finans/gelirler-takibi/cari-alacaklar/page.tsx`
  - `app/(app)/panel/finans/gelirler-takibi/faturalar/actions.ts`
  - `app/(app)/panel/finans/gelirler-takibi/faturalar/page.tsx`
  - `app/(app)/panel/finans/gelirler-takibi/faturalar/[id]/page.tsx`
  - `app/(app)/panel/finans/gelirler-takibi/page.tsx`
  - `app/(app)/panel/finans/giderler/actions.ts`
  - `app/(app)/panel/finans/giderler/gelen-faturalar/actions.ts`
  - `app/(app)/panel/finans/giderler/gelen-faturalar/page.tsx`
  - `app/(app)/panel/finans/giderler/kamusal-giderler/actions.ts`
  - `app/(app)/panel/finans/giderler/kamusal-giderler/page.tsx`
  - `app/(app)/panel/finans/giderler/page.tsx`
  - `app/(app)/panel/finans/giderler/tedarikciler/actions.ts`
  - `app/(app)/panel/finans/giderler/tedarikciler/page.tsx`
  - `app/(app)/panel/finans/kasa/actions.ts`
  - `app/(app)/panel/finans/kasa/page.tsx`
  - `app/(app)/panel/finans/kategori-iskonto-oranlari/actions.ts`
  - `app/(app)/panel/finans/kategori-iskonto-oranlari/page.tsx`
  - `app/(app)/panel/finans/kredi-karti/actions.ts`
  - `app/(app)/panel/finans/kredi-karti/page.tsx`
  - `app/(app)/panel/finans/page.tsx`
  - `app/(app)/panel/finans/raporlar/page.tsx`
  - `app/(app)/panel/islemler/page.tsx`
  - `app/(app)/panel/islemler/tanimlamalar/page.tsx`
  - `app/(app)/panel/paketler/page.tsx`
  - `lib/finans/nakit-banka-hareketi.ts`
  - `lib/ice-aktarma/hasta-eslestirme.actions.ts`
  - `lib/raporlar/hesaplamalar.ts`

## Modül 5 — Personel ve puantaj (QR akışı dahil)

- Durum: **bekliyor**
- Kalan dosyalar (20):
  - `app/(app)/panel/ayarlar/personel-tanimlama/actions.ts`
  - `app/(app)/panel/ayarlar/personel-tanimlama/page.tsx`
  - `app/(app)/panel/personel/actions.ts`
  - `app/(app)/panel/personel/basvurular/actions.ts`
  - `app/(app)/panel/personel/basvurular/page.tsx`
  - `app/(app)/panel/personel/izinler/actions.ts`
  - `app/(app)/panel/personel/izinler/page.tsx`
  - `app/(app)/panel/personel/izinler/talep-satiri.tsx`
  - `app/(app)/panel/personel/izinlerim/actions.ts`
  - `app/(app)/panel/personel/izinlerim/page.tsx`
  - `app/(app)/panel/personel/izinlerim/talep-formu.tsx`
  - `app/(app)/panel/personel/page.tsx`
  - `app/(app)/panel/personel/puantaj-cetveli/actions.ts`
  - `app/(app)/panel/personel/puantaj-cetveli/page.tsx`
  - `app/(app)/panel/personel/[id]/actions.ts`
  - `app/(app)/panel/personel/[id]/page.tsx`
  - `app/(app)/puantaj/[kisaKod]/[tur]/actions.ts`
  - `lib/personel/atanabilir-terapistler.ts`
  - `lib/personel/donem-maasi.ts`
  - `lib/personel/seans-sayisi.ts`

## Modül 6 — Kalan modüller (destek, yönetim, vb.)

- Durum: **bekliyor**
- Kalan dosyalar (9):
  - `app/(app)/basvuru/is/[kisaKod]/actions.ts`
  - `app/(app)/panel/destek/chatbot/page.tsx`
  - `app/(app)/panel/destek/kullanim-kilavuzu/page.tsx`
  - `app/(app)/panel/destek/page.tsx`
  - `app/(app)/panel/destek/talep-sikayetler/actions.ts`
  - `app/(app)/panel/destek/talep-sikayetler/page.tsx`
  - `app/(app)/panel/yonetim/denetim-gecmisi/page.tsx`
  - `app/(app)/panel/yonetim/gelmeme-analizi/page.tsx`
  - `app/(app)/panel/yonetim/page.tsx`

## Modül 7 — Çıkış uçları: PDF, e-posta/mesaj, cron/arka plan, chatbot

- Durum: **bekliyor**
- Not: Cron route'ları scripts/'e (bakim_rolu) taşınıp silinecek; PDF -> CHROMIUM_PATH; mesaj merkezi istemcisi withTenant; chatbot bayrakla kapalı.
- Kalan dosyalar (17):
  - `app/(app)/panel/ayarlar/mesajlasma/actions.ts`
  - `app/(app)/panel/ayarlar/mesajlasma/kredi/[kanal]/actions.ts`
  - `app/(app)/panel/ayarlar/mesajlasma/kredi/[kanal]/page.tsx`
  - `app/(app)/panel/ayarlar/mesajlasma/page.tsx`
  - `app/api/cron/audit-log-bolum-olustur/route.ts`
  - `app/api/cron/kredi-senkron/route.ts`
  - `app/api/cron/mesaj-kuyruk-isle/route.ts`
  - `app/api/cron/personel-donem-otomatik-kapat/route.ts`
  - `app/api/cron/resmi-tatil-guncelle/route.ts`
  - `app/api/destek-chatbot/route.ts`
  - `app/api/hasta-cari-hareketler/pdf/route.ts`
  - `app/api/hasta-kayit-formu/pdf/route.ts`
  - `app/api/is-basvuru-formu/pdf/route.ts`
  - `lib/mesaj/anlik-tetikle.ts`
  - `lib/mesaj/hasta-mesaji.ts`
  - `lib/mesaj/kuyruk-isle.ts`
  - `lib/mesaj/randevu-mesaji.ts`

## Taşırken temizlenecekler (takip)

Bkz. `scripts/dev/devam-notu.md` ve bu dosyanın modül notları. Temizlik kalemleri: QR formundaki gizli `klinik_id` alanı (tenant yalnız kısa koddan), `lib/qr/hiz-siniri.ts` (fail-closed), `ScheduledLogout`, tek oturum kilidi dosyaları (`lib/auth/oturum-kilidi.ts`, `giris-hiz-siniri.ts`), `lib/supabase/*`, `vercel.json`, `@supabase/*` paketleri.

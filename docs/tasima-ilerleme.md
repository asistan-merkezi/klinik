# Taşıma İlerlemesi (Supabase → Drizzle + withTenant + Better Auth)

> Bu dosya `node scripts/dev/ilerleme-uret.mjs` ile üretilir (sayımlar canlı). **Durum/not düzenlemek için scripts/dev/ilerleme-uret.mjs içindeki MODULLER tablosunu değiştir.**

## NEREDEN DEVAM EDİLECEK (bir sonraki oturum için)

**Durum (2026-10-27, oturum 1):** Aşama 4 ön adımları tamam (damgalı bağlam, Playwright giriş duman testi 9/9). **Modül 1 BİTTİ** (kalıntı: `lib/auth/eylem-yetkisi.ts` 8 çağıran bitene kadar, `lib/supabase/*` en sonda). Sıradaki: **Modül 2 (hasta ve randevu)** — önce `lib/randevu/queries.ts` + `RANDEVU_SELECT` Drizzle karşılığı, `components/panel/canli-cizelge` realtime (Aşama 6: SSE+LISTEN/NOTIFY gerekir; geçici çözüm veya önce SSE altyapısı için kullanıcıya sor), QR kayıt/anket (gizli `klinik_id` kaldır, `anonimUcCalistir`), `lib/qr/hiz-siniri.ts` sil.
**Yöntem:** `eylemYetkisiGetir` (eski, supabase döndürür) taşınmamış modüller için KALIYOR; taşınan modüller `lib/auth/yetki.ts > eylemYetkisi` (bağlam döndürür) kullanır. Sayfalarda `oturumBaglami()` + `tenantGerekli(ctx)` + `withTenant`. `docs/tasima-plani.md`'deki "tenant'ı DB'de türetme (A/B/C)" önerisi kullanıcı kararı bekliyor; modül taşıma damgalı bağlamla ilerliyor.
**Test yöntemi:** her modül için `tests/db/modul-<ad>.test.ts` (izolasyon + rol + gerçek yazma). Eylemler Next istek bağlamı istediğinden testler eylemlerin kullandığı Drizzle ifadelerini birebir sınar.


## Özet

| # | Modül | Durum | Taşınan / Toplam | Kalan Supabase import'lu dosya |
|---|---|---|---|---|
| 1 | Kullanıcı/profil, klinik ayarları, ortak yardımcılar | **bitti** | 12 / 18 | 6 |
| 2 | Hasta ve randevu (portal, QR kayıt/anket, canlı çizelge dahil) | **bekliyor** | 0 / 49 | 49 |
| 3 | Muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto | **bekliyor** | 0 / 10 | 10 |
| 4 | Ödeme / cari / finans / paket / işlem tanımları | **bekliyor** | 0 / 31 | 31 |
| 5 | Personel ve puantaj (QR akışı dahil) | **bekliyor** | 0 / 20 | 20 |
| 6 | Kalan modüller (destek, yönetim, vb.) | **bekliyor** | 1 / 10 | 9 |
| 7 | Çıkış uçları: PDF, e-posta/mesaj, cron/arka plan, chatbot | **bekliyor** | 0 / 17 | 17 |
| | **Toplam** | | 13 / 155 | **142** |

Not: "Toplam" taşıma başlangıcındaki dosya listesidir (`scripts/dev/tasima-baslangic.txt`, 155 dosya); sayım `@supabase`, `@/lib/supabase` ve `createAdminClient` kullanan dosyaları kapsar. `lib/supabase/*` en sonda silinir.

## Modül 1 — Kullanıcı/profil, klinik ayarları, ortak yardımcılar

- Durum: **bitti**
- Not: Taşınan: lib/auth (oturum bağlamı, gecerliKullanici/gecerliHasta, yetki.ts), panel layout/actions, ayarlar (şirket bilgileri, yetkilendirme, muhasebe sync), dosya deposu (lib/dosya, logo route'ları), gece zorunlu çıkış (sunucu tarafı, ScheduledLogout silindi), oturum kilidi dosyaları silindi. KALINTI (bilinçli): lib/auth/eylem-yetkisi.ts (8 taşınmamış çağıran var) ve lib/supabase/* son modülde silinecek; yeni migration 0006 (parasut_secret_var).
- Kalan dosyalar (6):
  - `lib/auth/eylem-yetkisi.ts`
  - `lib/supabase/admin.ts`
  - `lib/supabase/client.ts`
  - `lib/supabase/middleware.ts`
  - `lib/supabase/sayfali-okuma.ts`
  - `lib/supabase/server.ts`

## Modül 2 — Hasta ve randevu (portal, QR kayıt/anket, canlı çizelge dahil)

- Durum: **bekliyor**
- Not: canli-cizelge/randevu-bildirimleri realtime (Aşama 6).
- Kalan dosyalar (49):
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
  - `app/(app)/panel/page.tsx`
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

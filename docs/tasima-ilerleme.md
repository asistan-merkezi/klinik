# Taşıma İlerlemesi (Supabase → Drizzle + withTenant + Better Auth)

> Bu dosya `node scripts/dev/ilerleme-uret.mjs` ile üretilir (sayımlar canlı). **Durum/not düzenlemek için scripts/dev/ilerleme-uret.mjs içindeki MODULLER tablosunu değiştir.**

## NEREDEN DEVAM EDİLECEK (bir sonraki oturum için)

**Durum (2026-10-27, oturum 2):** Aşama 4 ön adımları tamam. **Tenant DB'de türetme (Seçenek A, 0007) UYGULANDI** (`kullanici_tenant` eşlemesi; `app.tenant_id` yalnız super_admin/klinik_anonim/bakım/süper kullanıcı oturumunda geçerli; 13 yeni test, performans farkı ölçüm gürültüsünde — `docs/tasima-plani.md`). **Modül 2a (realtime altyapısı) BİTTİ**: `lib/realtime/` + `/api/canli` SSE + `useCanliOlaylar` + 0008 NOTIFY tetikleyicileri; 3 tüketici Supabase realtime'sız (veri çekimleri hâlâ supabase-js — Modül 2'de sunucuya taşınacak). **Modül 1 BİTTİ** (kalıntı: `lib/auth/eylem-yetkisi.ts` 8 çağıran bitene kadar, `lib/supabase/*` en sonda). **Modül 2 (hasta ve randevu) BİTTİ.** Sıradaki: **Modül 3 (muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto)** — belge/foto yükleme Modül 2'de büyük ölçüde yapıldı. (Eski not:) — `lib/randevu/queries.ts` + `RANDEVU_SELECT` Drizzle karşılığı (canli-cizelge/tablet-ekrani/randevu-bildirimleri'ndeki `createClient()` veri çekimlerini sunucu eylemi/route'a taşı; `useCanliOlaylar`'ın `onOlay/onSenkron` geri çağrıları bu yeni çekimi tetikler), QR kayıt/anket (gizli `klinik_id` kaldır, `anonimUcCalistir`), `lib/qr/hiz-siniri.ts` sil.
**Yöntem:** `eylemYetkisiGetir` (eski, supabase döndürür) taşınmamış modüller için KALIYOR; taşınan modüller `lib/auth/yetki.ts > eylemYetkisi` (bağlam döndürür) kullanır. Sayfalarda `oturumBaglami()` + `tenantGerekli(ctx)` + `withTenant`. Tenant türetme Seçenek A uygulandı; Seçenek B (oturum jetonunu DB'de doğrulama) üretim öncesi karar noktası.
**Test yöntemi:** her modül için `tests/db/modul-<ad>.test.ts` (izolasyon + rol + gerçek yazma). Eylemler Next istek bağlamı istediğinden testler eylemlerin kullandığı Drizzle ifadelerini birebir sınar.


## Özet

| # | Modül | Durum | Taşınan / Toplam | Kalan Supabase import'lu dosya |
|---|---|---|---|---|
| 1 | Kullanıcı/profil, klinik ayarları, ortak yardımcılar | **bitti** | 12 / 18 | 6 |
| 2 | Hasta ve randevu (portal, QR kayıt/anket, canlı çizelge dahil) | **bitti** | 48 / 49 | 1 |
| 3 | Muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto | **bitti** | 10 / 10 | 0 |
| 4 | Ödeme / cari / finans / paket / işlem tanımları | **bekliyor** | 1 / 31 | 30 |
| 5 | Personel ve puantaj (QR akışı dahil) | **bekliyor** | 1 / 20 | 19 |
| 6 | Kalan modüller (destek, yönetim, vb.) | **bekliyor** | 2 / 10 | 8 |
| 7 | Çıkış uçları: PDF, e-posta/mesaj, cron/arka plan, chatbot | **bekliyor** | 1 / 17 | 16 |
| | **Toplam** | | 75 / 155 | **80** |

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

- Durum: **bitti**
- Not: Taşındı: randevu (actions, sorgular, canlı çizelge/tablet/bildirimler sunucu verisiyle), hasta (liste, detay, actions, veri-actions), portal, QR ön kayıt/anket/iş başvurusu/seans anketi (kısa kod + anonim kapı, gizli klinik_id kalktı, lib/qr/hiz-siniri silindi), hasta belgeleri (diskte, yetkili route /api/hasta-belge/[id], imza doğrulama), arşiv içe aktarma (hasta/randevu), QR yönetimi, resmi tatiller, elle mesaj. Yeni migration: 0009 (terapist_uygunluk_getir), 0010 (hasta_kullanici INSERT), 0011 (mesaj kuyruğu INSERT + kural SELECT). KALINTI (bilinçli, sonraki modüller): lib/qr/{klinik-bilgisi,qr-kod-aktif-mi}.ts ince sarmalayıcı (puantaj, Modül 5), lib/mesaj/randevu-hatirlatma-tarama.ts + lib/tatil/oneri-uret-admin.ts (cron, Modül 7), odeme-paket arşiv sihirbazı (Modül 4), PDF route'ları (Modül 7). KARAR BEKLEYEN: (1) resmi tatil `Şimdi kontrol et` butonu artık yazmıyor (global resmi_tatil/öneri yazımı yalnız aylık betikte; kullanıcıya yazma yetkisi verilmedi); (2) elle hasta mesajı anında göndermiyor, kuyruğa alıyor (kuyruk işçisi gönderir); (3) 0011 politikaları (mesaj_kurallari SELECT + mesaj_kuyrugu INSERT, klinik_admin/resepsiyon/terapist) service-role-siniflama (b) kararının gerektirdiği dar yetkilerdir.
- Kalan dosyalar (1):
  - `lib/tatil/oneri-uret-admin.ts`

## Modül 3 — Muayene: tablet, tedavi protokolleri, kaynaklar, belge/foto

- Durum: **bitti**
- Not: Taşındı: kaynaklar (oda/cihaz, pasife alma kontrolü), tedavi protokolleri (protokol+adımlar tek transaction), tablet (oda seçimi, ayarlar, ekran sayfası DAR veri şekliyle), belge/foto (Modül 2'de diskte). Yeni migration yok.
- Kalan dosyalar (0): —

## Modül 4 — Ödeme / cari / finans / paket / işlem tanımları

- Durum: **bekliyor**
- Kalan dosyalar (30):
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
  - `lib/raporlar/hesaplamalar.ts`

## Modül 5 — Personel ve puantaj (QR akışı dahil)

- Durum: **bekliyor**
- Kalan dosyalar (19):
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
  - `lib/personel/donem-maasi.ts`
  - `lib/personel/seans-sayisi.ts`

## Modül 6 — Kalan modüller (destek, yönetim, vb.)

- Durum: **bekliyor**
- Kalan dosyalar (8):
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
- Kalan dosyalar (16):
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
  - `lib/mesaj/kuyruk-isle.ts`
  - `lib/mesaj/randevu-hatirlatma-tarama.ts`

## Taşırken temizlenecekler (takip)

Bkz. `scripts/dev/devam-notu.md` ve bu dosyanın modül notları. Temizlik kalemleri: QR formundaki gizli `klinik_id` alanı (tenant yalnız kısa koddan), `lib/qr/hiz-siniri.ts` (fail-closed), `ScheduledLogout`, tek oturum kilidi dosyaları (`lib/auth/oturum-kilidi.ts`, `giris-hiz-siniri.ts`), `lib/supabase/*`, `vercel.json`, `@supabase/*` paketleri.

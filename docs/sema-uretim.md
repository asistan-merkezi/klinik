# Şema Üretimi (0002 nasıl yeniden üretilir)

`db/migrations/0002_temel_sema.sql` ve `db/seed/0001_referans_veri.sql` **elle yazılmaz**, üretilir. Üretici ve geçici Postgres düzeneği `scripts/dev/` altındadır (uygulamanın bağımlılığı değil; kendi `package.json`'u var). `0001`, `0003`, `0004` elle yazılmıştır ve üretimden etkilenmez.

## Gereksinim
Node.js (22+), internet (yalnız `npm install` için; `embedded-postgres` gerçek Postgres 18 ikilisini indirir). Windows/Linux/macOS. Sistem Postgres'i gerekmez, mevcut Postgres'e dokunulmaz (veri klasörü `scripts/dev/.veri/`, git'te yok).

## Adım adım
1. `cd scripts/dev && npm install`
2. `node yeniden-uret.mjs` — sırasıyla:
   1. **Referans kümesi** (`ref`, port 54330, her seferinde sıfırdan): geçici Postgres başlatılır.
   2. **Supabase uyumluluk katmanı** (`supabase-uyumluluk.sql`): yalnız eski migration'ların çalışması için `auth`/`storage`/`extensions` şemaları, `anon`/`authenticated`/`service_role` rolleri, `auth.uid()/role()/jwt()` fonksiyonları, `supabase_realtime` yayını ve Supabase'in varsayılan tablo yetkileri taklit edilir. **Bu katman hedef şemaya GİRMEZ.**
   3. `supabase/migrations` içindeki 172 dosya sırayla uygulanır. `20260918100000_pozisyon_katalogu_departman_yapisi.sql` canlı kliniğin sabit UUID'sine veri yazdığı için geçici bir klinik eklenip silinerek çalıştırılır (katalog tohumu kalır). Ardından `supabase/bekleyen/20261003110000_puantaj_pin_kaldir.sql` uygulanır (PIN RPC/kolonları taşınmaz). Herhangi bir migration hata verirse üretim durur.
   4. `kullanim-tara.mjs`: koddaki `.from(...)`/`.select(...)`/`.rpc(...)` çağrılarını tarayıp `db/arac/kod-kullanimi.json` yazar (hangi tablo hangi işlemle kullanılıyor). Değişkenle verilen tablo adları `sema-uret.mjs > ELLE` tablosunda elle çözülmüştür; kodda yeni dinamik `.from(değişken)` eklenirse tarayıcı "belirsiz" olarak listeler ve oraya eklenmelidir.
   5. `sema-uret.mjs`: referans kataloğundan (pg_catalog) enum, tablo, fonksiyon, kısıt, indeks, görünüm, tetikleyici, politika ve yetkileri okuyup `0002`'yi yazar. Dönüşümler: `auth.uid()` → `app_kullanici_id()`, `auth.role()='service_role'` → `sistem_baglami()`, `auth.users` → `kimlik_kullanici`, roller (`authenticated` → `klinik_uygulama`, `anon` → `klinik_anonim`), FORCE RLS + `sahip_aktif_tenant` politikaları, **kod-kullanimi.json'a göre daraltılmış tablo yetkileri**, `INVOKER_OLACAK` kümesi. Ayrıca `db/arac/yetki-ozeti.json` (tablo/fonksiyon yetki özeti, kodda kullanılmayan tablolar) yazar.
3. Doğrulama: `node kontrol-calistir.mjs` (aşağıda).

## Kurallar
- Üretici tek kaynaktır: `0002`'yi elle düzenleme. Davranışı değiştirmek için `sema-uret.mjs` veya eklenen `00xx` migration'ı değiştir.
- Üretimden sonra çalışan şema değişiklikleri artık `0005+` elle yazılan migration'larla gider (Supabase migration'ları bir daha okunmaz; referans kümesini yeniden kurmak yalnız `0002`'yi yeniden üretmek içindir ve `0001`/`0003`/`0004` ile tutarlı kalmalıdır).
- `0002` yeniden üretildiğinde `git diff` incelenir; yetki değişiklikleri `docs/yetki-matrisi.md` farkı olarak görünür.

## Kontroller (`node scripts/dev/kontrol-calistir.mjs`)
İki klinikli boş bir Postgres'te (port 54331) `db/` dosyalarından şemayı kurar, örnek veri yazar ve çalıştırır: `db/kontrol/bypassrls-kontrol.sql` (RLS atlayan rol/fonksiyon, FORCE, klinik_yedek pg_hba), `db/kontrol/yetki-matrisi.sql` (hangi rol hangi tabloda ne yapabilir; `docs/yetki-matrisi.md` çıktısını üretir), anonim self-servis kayıt testi, DEFINER duman testi. Çıkış kodu 0 = hepsi geçti.


## DÜZELTME (2026-10-28): elle yazılan migration kolonları KAYBOLMAZ

`lib/db/sema/schema.ts` `scripts/dev/drizzle-cek.mjs` ile **test kümesinden** (db/migrations 0001…son uygulanmış hâli) üretilir; `yeniden-uret.mjs` ise yalnız `0002_temel_sema.sql`, tohum veri ve `kod-kullanimi.json`'ı Supabase referansından üretir ve schema.ts'e DOKUNMAZ. Bu yüzden 0007+ migration'larıyla gelen kolonlar (örn. 0013 `kaynak_hareket_id`, `iade_istisna`, `iade_istisna_gerekcesi`) yeniden üretimde korunur — doğrulandı (drizzle-cek çıktısında üçü de var; fark yalnız tablo sıralaması). Önceki sürümdeki "silinir" uyarısı yanlıştı. Kural: yeni migration yazınca test-kur.mjs/db-kur.ps1 listesine ekle, sonra `drizzle-cek.mjs` ile schema.ts'i tazele.

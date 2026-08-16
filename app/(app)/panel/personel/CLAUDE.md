# Personel Modülü

Bu dosya `app/(app)/panel/personel/` altında çalışırken proje kökündeki `CLAUDE.md`'ye ek olarak okunur — kökteki dosya genel proje bağlamını, bu dosya modülün iç işleyişini anlatır. Kök dosyadaki "Veri Modeli"nde zaten tarif edilen tabloları (personel, terapist, personel_hassas, personel_puantaj vb.) burada tekrar etmiyoruz; sadece bu modülün kendine özgü akışlarını (izin, cari hesap) ve modül içi gezinmeyi kapsıyoruz.

## Rota Haritası

- `/panel/personel` — hub, 4 sekmeli (`?tab=` ile): **Pozisyonlar** (klinik_admin-only, gruplu liste + inline düzenleme + özel pozisyon ekleme), **Liste** (varsayılan, tüm roller), **Hesap** (cari hesap özeti, klinik_admin+muhasebe), **Puantaj** (İznim/İzin Talepleri kartları + Puantaj Cetveli'ne giriş, tüm roller). Sekme tanımları/rol erişimi tek yerde: `sekmeler.ts`.
- `/panel/personel/[id]` — kişi detayı, kendi içinde 2 sekmeli (`?tab=kisisel|odemeler`, farklı bir mekanizma — bu hub'ın `?tab=`'ıyla KARIŞTIRILMAMALI, ayrı bir state).
- `/panel/personel/puantaj-cetveli` — TÜM klinik için tek aylık matris (satır=personel, sütun=gün) — bkz. "Puantaj Cetveli" bölümü. **Eski `/panel/personel/[id]/calisma-cizelgesi` (tek kişilik günlük/yıllık tablo) 2026-08-19'da tamamen kaldırıldı, bu rota onun yerini alıyor** — iki paralel puantaj düzenleme ekranı bırakılmadı.
- `/panel/personel/basvurular` — iş başvurusu inceleme (klinik_admin-only).
- `/panel/personel/izinlerim` — kişinin kendi izin talepleri (self-servis, tüm roller kendi adına).
- `/panel/personel/izinler` — izin onay ekranı (klinik_admin-only, `notFound()` diğerlerine).

**Kaldırılan rotalar** (2026-08-18): `/panel/personel/maas` ve `/panel/personel/takip` tamamen silindi — içerikleri sırasıyla hub'ın **Hesap** sekmesine ve `[id]`'nin **Ödemeler** (Cari Hesap) kartına taşındı. Geri dönüş yok, linksiz kalıntı da yok.

## İzin Talep-Onay Akışı

**Durum makinesi** — TÜMÜ `personel_izin_talebi_*` SECURITY DEFINER RPC'lerinde zorlanır, tabloda hiç doğrudan INSERT/UPDATE/DELETE RLS policy'si YOK (sadece SELECT) — PostgREST üzerinden `.insert()`/`.update()` denemesi RLS tarafından sessizce reddedilir:

```
beklemede → onaylandi   (personel_izin_talebi_onayla, klinik_admin-only)
beklemede → reddedildi  (personel_izin_talebi_reddet, klinik_admin-only, red_gerekce ZORUNLU — DB CHECK'te de var)
beklemede → iptal       (personel_izin_talep_iptal_et, SADECE talebin sahibi personel)
onaylandi → iptal       (personel_izin_talebi_yonetici_iptal, SADECE klinik_admin, SADECE baslangic_tarih > current_date)
```

Başka hiçbir geçiş yok — `reddedildi`/`iptal` terminal, `onaylandi` sadece yukarıdaki tek koşulla `iptal`e gidebilir.

**Onayda ne olur**: `[baslangic_tarih, bitis_tarih]` aralığındaki her SAYILAN iş gününe (`personel_izin_is_gunu_sayisi` ile aynı hafta-tatili/resmi-tatil mantığı) bir `personel_puantaj` satırı yazılır — `durum='izinli'`, `kaynak='izin_talebi'`, `izin_talep_id` dolu. Yazmadan ÖNCE aralıktaki TÜM günler için `personel_puantaj_donemi_acik_mi()` kontrol edilir; herhangi biri kapalıysa TÜM onay reddedilir (`donem_kapali: YYYY-MM` mesajıyla, hiçbir kısmi yazma olmaz). Yönetici iptali bu satırları `DELETE ... WHERE izin_talep_id=...` ile geri alır.

**Bakiye** (`v_personel_izin_bakiye`): `hak_gun + devir_gun + duzeltme_gun − onaylanan_gun − beklemede_gun`, SADECE `tip='yillik'` talepler bu formüle girer (mazeret/ucretsiz/idari/telafi hiç etkilemez). `hak_gun` STORE EDİLMİYOR — `personel_izin_hak_gun_hesapla()` ile her sorguda kıdem+yaştan hesaplanır (bkz. Projeye Özel).

**Gün sayacı**: `personel_izin_is_gunu_sayisi(baslangic, bitis)` — `authenticated`'a EXECUTE açık (canlı önizleme için, `current_klinik_id()` içeriden çözülür, client'tan klinik_id alınmaz). Bir gün "hafta tatili" sayılır eğer `klinik.pazar_baslangic`/`cumartesi_baslangic` o gün için NULL ise (sabit "sadece Pazar" değil, kliniğin gerçek çalışma günlerine göre). **366 günden uzun aralık reddedilir** (`tarih_araligi_cok_uzun`) — bilinçli DoS koruması, adversarial review'da bulundu.

**Bildirim**: `personel_izin_talebi_yeni` (yeni talep → klinikteki tüm klinik_admin'lere) ve `personel_izin_sonuc` (sonuç → talebi açan personele) — `lib/mesaj/tetikleyiciler.ts` kataloğunda, gerçek gönderim `lib/mesaj/anlik-tetikle.ts`'teki `anlikMesajTetikle()` ile (bu, projede Faz 4'ün — olay-tetikleme — İLK yazılan kod yolu, önceki turlarda sadece kod tabanına bağlanmayı BEKLİYORDU). Ayrı bir "email-service" entegrasyonu YOK — hem mail hem WhatsApp/SMS aynı merkezi mesajlaşma modülünden gidiyor (proje zaten 3 kanalı da destekliyor).

## Cari Hesap (personel_hesap_hareket)

Maaş/hakediş/avans tek deftere taşındı — eski `personel_ekstra_hakedis` ve `personel_odeme` tabloları **tamamen kaldırıldı** (0 satırdı, veri taşınmadı, silindi).

**Türler**: `hakedis`, `prim`, `yol`, `yemek`, `mesai` bakiyeyi **artırır** (+); `avans`, `kesinti`, `odeme` **azaltır** (−). Yön `tur`den türetilir (`types/hesap-hareket.ts` → `HESAP_HAREKET_YONU`), `tutar` her zaman pozitif saklanır.

**`hakedis` elle eklenemez** — hem `personel_hesap_hareket_ekle` RPC'si (manuel ekleme, klinik_admin-only) bunu reddeder hem de tablo CHECK'i (`kaynak_id` dolu olmayan bir `hakedis` satırı hiç var olamaz). Tek yazma yolu: dönem kapanışı → `donemKapat` server action'ı (`[id]/calisma-cizelgesi/actions.ts`) `personel_puantaj_donem_kapat` RPC'sinden dönen `donem_id`'yi kullanıp `lib/maas.ts`'teki `maasHesapla()`'yı ÇAĞIRIR (formül TEK yerde, SQL'de tekrarlanmıyor) ve sonucu `personel_hesap_hareket_donem_ekle(donem_id, taban, prim)` RPC'sine geçirir — bu RPC idempotent'tir (`zaten_islendi` — aynı döneme ikinci kez hakediş yazılamaz). "Fazla mesai" (`mesai` türü) hâlâ `personel_puantaj_donem_kapat`'ın kendi içinde (SQL'de) yazılıyor, taşınmadı — sadece hedef tablosu değişti.

**`personel_ucret`** (eski adı `personel_maas_gecmisi`) — append-only, UPDATE/DELETE yok. Ücret değişikliği her zaman YENİ satır (mevcut satır asla güncellenmez) — bu davranış zaten mevcuttu, sadece isim netleşti.

## Pozisyonlar (2026-08-19)

`pozisyon_sablonlari` (platform şablonu, klinik_id yok, sadece migration/seed ile değişir) + `pozisyonlar` (klinik bazlı, `sablon_id` opsiyonel bağlantı) — her pozisyonun 4 ayarı: `sistem_erisimi` (login hesabı olacak mı), `varsayilan_rol` (`kullanici_rol_tipi`, `super_admin` HARİÇ — aynı gerekçe: klinik_admin kendini platform admine yükseltemesin), `ucret_tipi` (`aylik_maas`/`prim_usulu`), `puantaj_modu` (`gunluk`/`esnek`/`takipsiz`). **Yeni bir klinik oluşturulunca `trg_klinik_pozisyonlari_seed` trigger'ı 9 şablon pozisyonu otomatik kopyalıyor** (Fizyoterapist/Doktor/Klinik Yöneticisi/Resepsiyon/Hemşire/Masör/Diyetisyen/Temizlik/Muhasebe) — bu trigger olmadan yeni klinikler boş bir Pozisyonlar sekmesiyle başlıyordu, Playwright ile gerçek bir test klinikte bulunup düzeltildi.

`personel.pozisyon_id` — mevcut 5 personel migration anında `gorev` serbest metnine göre otomatik eşleştirildi/geri kalanlar için özel (`ozel_mi=true`) pozisyon oluşturuldu (hiçbir personel pozisyonsuz kalmadı); `personel.gorev` KALDIRILMADI, hâlâ tek başına da geçerli — `pozisyon_id` bir üst katman, iki alan senkron TUTULMUYOR (birini değiştirmek diğerini otomatik güncellemez).

**Pasife alma kısıtı**: bağlı **aktif** personeli olan bir pozisyon pasife alınamaz (`trg_pozisyon_pasif_engelle`, `pozisyon_personel_bagli` hatası) — pasif personelin bağlı olduğu pozisyon serbestçe pasife alınabilir. **DELETE hiç yok** (RLS'te policy'si yok) — pozisyonlar sonsuza dek durur, sadece aktif/pasif.

## Puantaj Cetveli (2026-08-19)

Tek route (`/panel/personel/puantaj-cetveli`), tüm klinik için aylık matris — satırlar `pozisyon.puantaj_modu != 'takipsiz'` olan aktif personel (varsayılan 9 şablonun hiçbiri `takipsiz` değil, bu yüzden bugün itibarıyla tüm aktif personel görünüyor — `takipsiz` sadece Özel Pozisyon formuyla seçilebilen, bir personeli cetvelden tamamen çıkarma seçeneği), sütunlar ayın günleri. Hücre kodu (`lib/personel/puantaj-cetveli.ts` → `gunKoduHesapla`) öncelik sırası: gerçek `personel_puantaj` kaydı > `resmi_tatil` tablosu > kliniğin kendi hafta sonu ayarı (`klinik.cumartesi_baslangic`/`pazar_baslangic` NULL ise o gün "X") > boş. `kaynak='izin_talebi'` olan hücreler dialogda salt-okunur gösteriliyor (izin akışının otomatik yazdığı günlere elle dokunulamaz, düzeltme gerekiyorsa ilgili izin talebi üzerinden yapılmalı).

**Hakediş (₺) TEK kaynağı `lib/personel/hakedis.ts`** — hiçbir UI bileşeni taban/prim/mesai formülünü tekrarlamıyor. Dönem KAPALI ise `personel_hesap_hareket`teki gerçek (`hakedis`+`prim`+`mesai`) satırların toplamı ("kesin" etiketiyle) gösteriliyor; AÇIK ise `personel_puantaj_donem_kapat` RPC'sinin şu an kapatılsaydı yazacağı tutarla BİREBİR aynı formülle canlı tahmin ("tahmini" etiketiyle) hesaplanıyor — `donemKapat` server action'ı da artık `maasHesapla()`'yı doğrudan çağırmıyor, aynı `hakedisHesapla()`'yı kullanıyor.

Hücreye tıklamak TEK, kontrollü bir `HucreDuzenleDialog` açıyor (150+ hücre için 150+ ayrı Dialog örneği YOK — üstteki `PuantajCetveliIstemci`'de tek bir "seçili hücre" state'i var); onay bekleyen fazla mesai varsa aynı dialogda `FmOnayButonlari` inline gösteriliyor. Dönem kapat/aç satır bazında (`DonemKapatButonu`/`DonemYenidenAcButonu`, eski tek-kişilik ekrandan taşındı, değişmedi). CSV export client-side (UTF-8 BOM + `;` ayraç + tr-TR sayı biçimi — Türkçe Excel için), günlük kodlar + toplam kolonları içeriyor, ekrandaki `.eksikGun`/`.hakedis` ile AYNI değerleri paylaşıyor (ayrı bir hesap yolu yok).

**Bilinçli kapsam kararı**: eski ekranın "Yıllık" görünümü (12 aylık özet) bu turda YOK EDİLDİ, geri getirilmedi — cetvelin ay-bazlı toplam kolonları benzer bilgiyi (o ay için) zaten veriyor, yıl bazlı karşılaştırma ayrı bir ihtiyaç olarak GELECEKte ele alınabilir. Vardiya ataması (`personel_vardiya_atama`) artık dialogda "Planlanan" saat olarak GÖSTERİLMİYOR (eskiden `personel_vardiya_atama`'dan sanal planlanan hesaplanıyordu) — cetvel çapında bunu hesaplamak karmaşıklığı artırıyordu, bilinçli olarak trim edildi; tablo `vardiya_turu` şeması hâlâ duruyor, sadece bu ekran onu okumuyor.

## Bilinen Kısıtlar (bilinçli, dokümante edildi)

- **`revalidatePath` — `/panel/personel` (hub) rotasını, o rotanın bir ALT rotasından (örn. `/izinler`, `/[id]`) çağrılan bir server action içinde revalidate etmek, `useActionState`'in `isPending`'ini SONSUZA KADAR takılı bırakıyor** (network isteği 200 dönüyor, veri gerçekten yazılıyor, ama client hiç "tamamlandı" sinyali almıyor — kullanıcı butonun "Ekleniyor..." durumunda donduğunu görüyor). Bu turda gerçek Playwright testleriyle bulundu ve TÜM etkilenen action'lardan (`hesapHareketiEkle`, `donemKapat`, `izinTalebiOnayla/Reddet/YoneticiIptalEt`) o satır kaldırılarak düzeltildi — **aynı rotadan** (`/panel/personel/actions.ts`, Liste sekmesindeki hızlı aksiyonlar), **kardeş rotalar arasında** (`izinlerim` ↔ `izinler`, `/panel/personel` ↔ `/panel/personel/puantaj-cetveli`) revalidate etmek SORUN DEĞİL. **2026-08-19'da ayrıca test edildi ve GÜVENLİ bulundu**: bir ÜST/ana rotadan (`/panel/personel`, Liste sekmesindeki `hizliPuantajKaydet`) bir ALT rotayı (`/panel/personel/puantaj-cetveli`) revalidate etmek — yani tehlikeli yön SADECE "alt rotadan üst hub'ı revalidate etmek", tersi (üstten alta) sorunsuz (gerçek Playwright'ta ölçüldü, 5sn+ bekleme sonrası hang olmadığı doğrulandı). Kesin kök neden (Next.js 16 / React 19 segment-tree reconciliation'da bir edge-case olması muhtemel) hâlâ doğrulanmadı — sadece semptom + kesin tetikleyici yön belgelendi. **Bu modülün dışında, `/panel/personel` hub'ını hiç kullanmayan başka bir action'da aynı desen varsa (aynı sınıf hata) ayrıca kontrol edilmedi.**
- Dini bayram tatilleri (`resmi_tatil`) sadece **2026** için seed'li (kaynak: enuygun.com/turktelekom.com.tr resmi tatil takvimleri) — 2027+ için hiçbir otomatik yenileme yok, klinik_admin'e açık bir yönetim ekranı da henüz yok (sadece tablo+seed var, doğrudan DB'den eklenmeli).
- İzin bakiyesi (`v_personel_izin_bakiye`) ve izin belgeleri (`personel-belge` bucket), `personel` tablosunun zaten var olan geniş (rol ayrımı olmayan) klinik-içi SELECT policy'sini miras alıyor — herhangi bir terapist/resepsiyon, klinikteki herkesin izin bakiyesini görebiliyor. Bu YENİ bir kısıt değil, `personel.maas` da aynı şekilde zaten görünür durumda (pre-existing) — Puantaj Cetveli de aynı mirası taşıyor (herhangi bir authenticated personel tüm klinikteki puantaj/hakediş satırlarını görebiliyor, sadece düzenleme klinik_admin'e kilitli).
- Aynı personel için çakışan/yinelenen `beklemede` izin talepleri engellenmiyor (birden fazla talep aynı tarih aralığını kapsayabilir) — bakiye kartında `beklemede_gun` bu durumda şişebilir. Ürün kararı gerektiriyor, bilinçli olarak düzeltilmedi.
- `personel.tc_kimlik_no` (düz metin, legacy) 2026-08-19'da kaldırıldı — TC/pasaport artık SADECE şifreli `personel_hassas`'ta (canlıda 0 satır dolu olduğu doğrulandı, veri kaybı riski yoktu). `is_basvurusu.tc_kimlik_no` (iş başvurusu aday verisi, ayrı tablo/kavram) BUNA DAHİL DEĞİL, dokunulmadı.

## Projeye Özel — Bu Kliniğe Uygulanan Somut Değerler

- **Yıllık izin hak günü** (`personel_izin_hak_gun_hesapla`, kıdem `personel.ise_giris_tarihi`'nden hesaplanır): `<1 yıl → 0` (İş Kanunu m.53 ile tutarlı, kullanıcı görev tarifi bunu açıkça belirtmedi — 1-5 yıl aralığının doğal alt sınırı olarak yorumlandı), `1–5 yıl → 14`, `5–15 yıl → 20`, `15+ yıl → 26`; **50 yaş ve üzeri** (`personel.dogum_tarihi`) için bu değerlerin **en az 20** olması zorlanır (`GREATEST`, taban değil taban+ek değil — İş Kanunu m.53'teki "20 günden az olamaz" tabanıyla birebir). `ise_giris_tarihi` hiç girilmemişse asgari 14 gün varsayılır.
- **İzin tipleri**: `yillik`, `mazeret`, `ucretsiz`, `idari`, `telafi` — SADECE `yillik` bakiyeden düşer.
- **Cari hesap türleri**: `hakedis`, `prim`, `yol`, `yemek`, `mesai` (+) · `avans`, `kesinti`, `odeme` (−).
- **Puantaj kaynak** (`personel_puantaj.kaynak`): `manuel`, `tablet`, `self_qr`, `izin_talebi` — bu 4 değer nihai, `MIGRATION-KAPSAM.md`'nin daha geniş taslak seti (`yonetici`/`pin`/`toplu`) hiç uygulanmadı, karıştırılmamalı.
- **Belge yükleme** (izin talebi + iş başvurusu kaşe): `personel-belge` Storage bucket'ı — 5MB limit, `image/jpeg`/`image/png`/`image/webp`/`application/pdf` (PDF desteği bu turda eklendi, önceden sadece görsel kabul ediyordu — izin belgesi formu PDF sunuyordu ama bucket reddediyordu, adversarial review'da bulunup düzeltildi).
- **Pozisyon şablonları** (9 sabit): Fizyoterapist/Doktor/Hemşire/Masör/Diyetisyen (`Klinik Ekibi`, terapist rolü) · Klinik Yöneticisi/Muhasebe (`Yönetim`, `puantaj_modu='esnek'` — bu ikisi Puantaj Cetveli'nde görünür ama günlük hücre kodu takibi mantıksal olarak daha az anlamlı, yine de dışlanmadı) · Resepsiyon (`Operasyon`) · Temizlik (`Destek`, tek `sistem_erisimi=false` olan pozisyon — `puantaj_modu` yine `gunluk`, cetvelde görünmeye devam ediyor). `puantaj_modu='takipsiz'` hiçbir şablonda seçilmedi (henüz gerçek bir "cetvelden tamamen çıkar" ihtiyacı yoktu) — Özel Pozisyon formunda bu seçenek klinik_admin'e açık, seçilirse o pozisyondaki personel cetvelden otomatik düşer.

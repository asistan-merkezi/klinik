# Prova Kaydı (Windows Server dağıtım provası)

Bu belge `docs/sunucu-kurulum.md` §12'deki **23 adımlık prova planının koşum kaydıdır**: her adımın gerçek çıktısı, sonucu ve notu burada tutulur.
**Durum: HİÇ KOŞULMADI** (2026-10-28 itibarıyla temiz Windows makinesi yok). Boş bırakılan her hücre "yapılmadı" demektir; yapılmayan/geçmeyen adım "geçti" diye işaretlenmez.

Nasıl kullanılır: (1) Ortam hazırlığı bölümünü tamamla, (2) adımları sırayla koş, (3) her adımda **gerçek çıktıyı** (kısa; parola/jeton/anahtar ASLA yazma) ve sonucu (`geçti` / `kaldı` / `atlandı`) doldur, (4) her hata **Hata günlüğü**ne girer ve betikte/dokümanda düzeltme gerekiyorsa düzeltilir, düzeltmeden sonra adım yeniden koşulup kayıt güncellenir.
Prova tamam kriteri: 1–23 geçti (ya da atlananlar gerekçeli), sapmalar `docs/sunucu-kurulum.md` ve betiklere işlendi.

---

## 1. Ortam hazırlığı

### 1.1 Ortam bilgisi (koşumdan önce doldur)

| Alan | Değer |
|---|---|
| Prova tarihi (başlangıç / bitiş) | |
| Koşan kişi | |
| Ana bilgisayar (Hyper-V ana makinesi) ve işletim sistemi sürümü | |
| Sanal makine adı / nesil / vCPU / RAM / diskler | |
| Windows Server sürüm ve yapı numarası (`winver`) | |
| Değerlendirme sürümünün bitiş tarihi (180 gün) | |
| Prova edilen depo commit'i / paket etiketleri (`<s1>`, `<s2>`, `<s3>`) | |
| `deploy/windows` betiklerinin commit'i | |

### 1.2 Windows Server 2022 deneme sürümü + Hyper-V sanal makinesi

1. **ISO:** Microsoft Evaluation Center'dan *Windows Server 2022 (180 günlük değerlendirme)* ISO'su (64-bit, İngilizce ya da Türkçe; **Desktop Experience** seçeneğini kurun — betikler GUI gerektirmez ama `secpol.msc`/Olay Görüntüleyici denemeleri için kolaylık sağlar). ISO'nun SHA256 özetini sayfadakiyle karşılaştırıp 1.4'e yazın. Değerlendirme sürümü 180 günde kapanır; prova bunun içinde biter. Üretim için ayrı lisanslı kurulum yapılır (prova makinesi atılır).
2. **Hyper-V:** Ana bilgisayarda Windows 10/11 Pro-Enterprise-Education ya da Windows Server + *Hyper-V* rolü etkin (`Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All`, yeniden başlatma). Windows Sandbox yalnız hızlı ön deneme içindir (her kapanışta sıfırlanır, Windows servisi/NTFS izin provası için uygun DEĞİL); asıl prova Hyper-V VM'inde yapılır.
3. **VM:** Nesil 2, 4 vCPU, 8 GB RAM (dinamik bellek kapalı), **disk 1: 80 GB** (işletim sistemi + `C:\klinik`), **disk 2: 40 GB** (`E:` — *ayrı disk* yedek kopya hedefi, `YEDEK_DIS_KOPYA_HEDEFI`), güvenli önyükleme: Microsoft Windows şablonu, ağ: *Default Switch* (internet çıkışı: GitHub 443 gerekir; yalnız 22. adım için). Saat dilimi `Turkey Standard Time` (kurulum.ps1 ayarlar; Hyper-V "Zaman eşitleme" hizmeti açık kalsın).
4. **Kimlik:** yerel yönetici hesabı + ayrı bir **deploy hesabı** (yönetici grubunda; `guncelle.ps1` ve görev bu hesapla çalışır). Hesap parolalarını parola yöneticisine koyun; bu belgeye YAZMAYIN.
5. **Çevrimdışı çalışma:** İnternetsiz bir sunucuya taşınacak dosyalar için 1.4. Sunucuya dışarıdan dosya taşıma: Hyper-V *Enhanced Session* / `Copy-VMFile` / paylaşımlı sanal disk (`.vhdx`).

### 1.3 Checkpoint (kontrol noktası) stratejisi

- Tür: **Production checkpoint** (uygulama tutarlı, Windows VSS); servis/NTFS izin denemelerinde geri dönüş için yeterli. PostgreSQL veri dizini için de tutarlıdır (VSS aware).
- Her kritik adımdan ÖNCE `Checkpoint-VM -Name <vm> -SnapshotName <ad>` (ya da Hyper-V Yöneticisi). Geri dönmek: `Restore-VMCheckpoint`. Adım sonucu kaydedildikten SONRA bir sonraki checkpoint alınır; böylece her hata kendi adımından yeniden başlatılabilir.
- Önerilen adlar (tablo 3'teki "Checkpoint" sütunu da aynı adları kullanır): `00-temiz-os` (OS kurulu, güncellemeler, **araçlar henüz kurulmadı**) · `02-kurulum-sonrasi` (kurulum.ps1 sonrası) · `03-db-kurulu` (db-kur sonrası, süper kullanıcı parolası temizlenmiş) · `04-servisler-hazir` (servis-kur sonrası, çalışan sistem) · `05-yedek-alindi` · `06-surum2-calisiyor` (yükseltme sonrası) · `07-imza-temel` (21. adım öncesi).
- Checkpoint'ler diskte yer tutar: prova bitince **tümünü birleştirip silin**; üretim kopyası checkpoint'ten OLUŞTURULMAZ.

### 1.4 İndirme / çevrimdışı dosya kontrol listesi

**Sürüm sütunları:** *Repo'nun sabitlediği/denendiği* sürüm yazılıdır; olmayanlarda yalnız **asgari/hedef** verilmiştir — kurulan GERÇEK sürümü ve indirilen dosyanın SHA256'sını son iki sütuna yazın. Sürüm numarası uydurulmadı: bilinmeyen yer "güncel kararlı" olarak bırakıldı ve provada kaydedilir.

| # | Bileşen | Hedef / asgari sürüm | Kaynak | Dosya adı (indirilen) | Kurulan sürüm | SHA256 (indirilen dosya) |
|---|---|---|---|---|---|---|
| 1 | Windows Server 2022 Evaluation ISO | 2022, 180 gün | Microsoft Evaluation Center | | | |
| 2 | PostgreSQL | **18.x** (repo 18'e göre yazıldı ve 18 ile test edildi) | EDB Windows x86-64 yükleyicisi (postgresql.org/download/windows) | | | |
| 3 | Node.js | **v22.14.0** (`.nvmrc`) ya da aynı major'ın güncel LTS'i | nodejs.org Windows x64 `.msi` | | | |
| 4 | Google Chrome (ya da Edge) | güncel kararlı; PDF için `puppeteer-core` 25.1.0 ile denendi (Chrome ~149 milestone). Sürümü kaydet | chrome kurumsal `.msi` / Edge | | | |
| 5 | Caddy | 2.x güncel kararlı (Windows amd64) | github.com/caddyserver/caddy/releases | | | |
| 6 | NSSM | 2.24 (kararlı sürüm; 64-bit `nssm.exe`) | nssm.cc | | | |
| 7 | age | 1.x güncel kararlı (Windows amd64 zip: `age.exe`, `age-keygen.exe`) | github.com/FiloSottile/age/releases | | | |
| 8 | minisign | 0.11 ya da üstü (Windows `minisign.exe`) | github.com/jedisct1/minisign/releases | | | |
| 9 | Sürüm paketi `<s1>`: `klinik-<s1>.zip` + `.sha256` + `.minisig` | CI çıktısı (imzalı, yayınlanmış) | GitHub sürüm ekleri | | | |
| 10 | Sürüm paketi `<s2>` (en az 1 yeni **uyumlu** migration; imzalı) | 13. adım için | `scripts/yayin-imzala.ps1` | | | |
| 11 | Sağlıksız paket `<s3>` (imzalı; geçişten sonra `/api/saglik` 503 verir) | 15. adım için | geliştirici makinesinde üret | | | |
| 12 | Bozuk/imzasız/yanlış anahtarlı/eski imzalı paket varyantları | 14, 18–20. adımlar | geliştirici makinesinde üret | | | |
| 13 | Geliştiricinin **açık anahtarı** `klinik.pub` + anahtar kimliği (sesli doğrulama) | 21. adım için ikinci bir deneme çifti de | geliştirici | | | |
| 14 | GitHub **salt-okunur jeton** (Contents:Read, tek depo, kısa ömürlü) | 22. adım; prova sonunda İPTAL EDİLİR | GitHub | — (kaydetme!) | — | — |
| 15 | Geliştirici makinesi araçları: `gh`, `minisign`, Node/npm | yayın/imza için | | | | |

**Özet dosyası:** Taşınacak klasörde (`E:\offline` gibi) `Get-ChildItem -File | Get-FileHash -Algorithm SHA256 | Select Hash,@{n='Dosya';e={Split-Path $_.Path -Leaf}} | Format-Table -Auto | Out-String` çıktısını `SHA256SUMS.txt` olarak saklayın; sunucuya taşıdıktan sonra aynı komutu yeniden çalıştırıp eşleşmeyi doğrulayın. İnternet bağlantısı olan makinede ayrıca `winget search`/resmi sayfa ile sürümleri teyit edin.

**Asgari donanım/ağ:** VM'den ana makineye 443/GitHub erişimi yalnız 22. adım için; geri kalan adımlar ağsız koşar (ACME/Let's Encrypt gerçek alan adı ister — provada `localhost` kullanılır, HTTPS sertifikası otomatik alınmaz: Caddy `localhost` için yerel CA kullanır).

---

## 2. Adımlar uygulama tamamlanmadan da koşulabilir mi?

Prova iki turdur:
- **A turu — dağıtım hattı (şimdi, uygulama tamamlanmadan):** paket → imza → kurulum → veritabanı → servisler → yedek/geri yükleme → yükseltme/geri dönüş → imza/jeton reddi → hesap hakları. Uygulamanın o günkü derlemesi (hatta boş sayfa açan bir sürüm) yeterlidir; `/api/saglik` ve veritabanı bağlantısı çalışmalıdır.
- **B turu — uygulama tamamlanınca (ayrıca TEKRAR):** giriş (personel e-posta/telefon, hasta portalı, QR akışları), ekran akışları (randevu → check-in → tablet/SSE, PDF üretimi, finans sayfaları), gerçek migration setiyle yükseltme ve **geriye dönük uyum** (16. adım), gerçek veri hacmiyle yedek/geri yükleme süresi, zamanlanmış bakım görevleri (Modül 7).

| Konu | A (şimdi) | B (uygulama bitince tekrar) |
|---|---|---|
| Kurulum, PostgreSQL sertleştirme, roller, kontroller (1–6) | ✔ | yalnız yeni migration eklendiyse 4. adımı kısa tekrar |
| İlk sürüm + servisler (7–8) | ✔ (o günkü paketle) | son paketle 7–8'i yeniden |
| Duman testi (9) | yalnız açılış + `/api/saglik` + giriş sayfası görünür mü | **tam**: giriş, randevu→check-in→tablet, PDF, `/api/canli`, QR |
| Yedek / geri yükleme (10–12) | ✔ (örnek veriyle) | gerçek/büyük veriyle: süre ve doğruluk ölçümü |
| Yükseltme / geri dönüş (13–16) | ✔ (sahte uyumlu migration) | gerçek migration'larla; eski kodun yeni şemada çalışması |
| Dayanıklılık, imza, jeton, hesaplar (17–23) | ✔ | gerçek bakım görevleri kaydı (Modül 7 sonrası) |

**Henüz kapsam dışı (uygulama/Modül 7 bitmeden prova EDİLEMEZ):** `scripts/*.mjs` bakım görevleri (kuyruk işleme, dönem kapatma, kredi senkronu) ve bunların Task Scheduler kayıtları, e-posta/mesaj merkezi gönderimi, SSE oturum kontrolü (üretim kapısı #8), Paraşüt, PDF'in gerçek şablonlarla tam akışı.

**Beklenen sürprizler (denenmemiş, önceden bilinen riskler)** — bunlardan biri patlarsa Hata günlüğüne yazın:
1. `nssm set ObjectName "NT SERVICE\klinik-uygulama"` parolasız kabul edilmeyebilir → betik `sc.exe config obj=` yedek yoluna düşer (8. adım).
2. LSA hak atama (`SeBatchLogonRight`, deny interaktif/RDP) yalnız yönetici + doğru PowerShell oturumunda çalışır (23. adım).
3. `minisign` çıktı biçimi (`Trusted comment:` satırı) ve `gh release download`'ın TASLAK sürümde davranışı (1, 13, 18–21).
4. GitHub'ın `github-authentication-token-expiration` başlığı yalnız fine-grained jetonda gelir (22. adım).
5. `pg_restore --clean --if-exists --no-owner --role=klinik_sahip` ile FORCE RLS/rol sahiplikleri (11–12).
6. `caddy validate` ve Caddyfile (`admin off`, `lb_try_duration`) sürüm uyumu (8).
7. Windows PowerShell 5.1: BOM'suz betik dosyaları Türkçe karakterde sözdizimi hatası verir (betikler BOM'lu); `tar.exe` zip açma; `Start-Process` ile ön uçuş (7, 13).
8. EDB PostgreSQL yükleyicisi `pg_hba.conf`'u ilk kurulumda `scram-sha-256` yerine farklı yöntemle yazabilir; kurulum.ps1 yeniden yazıp doğrular (2).

---

## 3. Adım kaydı (23 adım)

Sonuç sütunu: `geçti` / `kaldı` / `atlandı` (atlandıysa nedeni Not'ta). "Ne yapılır" ve "Beklenen çıktı" `docs/sunucu-kurulum.md` §12 ile birebirdir; fark görürseniz **orası** kaynaktır. "Tur" sütunu §2'deki A/B ayrımıdır, "Checkpoint" önerisi §1.3'tür.

| Adım | Tur | Checkpoint | Ne yapılır | Beklenen çıktı | Gerçek çıktı | Sonuç | Not | Tarih |
|---|---|---|---|---|---|---|---|---|
| 1 | A | — | **Paket bütünlüğü + imza** — `Get-FileHash -Algorithm SHA256 C:\klinik\ilk\klinik-<s1>.zip` ; `Get-Content …sha256` ; `minisign -V -m …zip -p klinik.pub -x …zip.minisig` | Özetler **birebir aynı**; minisign `Signature and comment signature verified` + `Trusted comment: klinik-<s1>`. `tar -xf … -C C:\klinik\ilk\paket` sorunsuz; `paket\server.js`, `paket\db\migrations`, `paket\deploy\windows` var. | | ☐ | | |
| 2 | A | ÖNCE: `00-temiz-os` | **Sunucu hazırlığı** — `paket\deploy\windows\kurulum.ps1` (bakım/yedek hesap parolaları sorulur) | `PostgreSQL dogrulamasi TAMAM: yalniz localhost dinliyor…`; "Tum araclar mevcut" (eksikse listelenir); `C:\klinik\{gizli,surumler,indirme,log,dosya,yedek,caddy-veri}` oluşur; hata/`throw` YOK. Elle doğrula: `Get-NetTCPConnection -State Listen -LocalPort 5432` → yalnız `127.0.0.1` ve `::1`; `Get-Content <veri>\pg_hba.conf` → yalnız `127.0.0.1/32`, `::1/128` + son iki `reject` satırı, yöntem `scram-sha-256`; `postgresql.conf` sonunda `listen_addresses = 'localhost'`. | | ☐ | | |
| 3 | A | ÖNCE: `02-kurulum-sonrasi` | **Veritabanı kurulumu** — `$env:PGPASSWORD=<postgres>`; `KLINIK_*_SIFRE` (5 adet) ver; `paket\scripts\db-kur.ps1` | Sırayla `>> db/kurulum/00…03`, `>> db/migrations/0001…00NN`; sonda `bypassrls-kontrol: temiz`, `yetki-matrisi: temiz`, `N migration 'uygulandi' olarak kaydedildi.`, `Kurulum tamam.` Hata satırı YOK. Sonra `Remove-Item Env:PGPASSWORD`. | | ☐ | | |
| 4 | A + B (migration eklenince kısa tekrar) | — | **Kontrolleri ayrıca çalıştır** — `psql -h localhost -U postgres -d klinik -f paket\db\kontrol\bypassrls-kontrol.sql` ; `… yetki-matrisi.sql` | `NOTICE: bypassrls-kontrol: temiz …`, `NOTICE: yetki-matrisi: temiz`; `HATA` satırı yok; `hba_zayif_yontem` UYARI satırı yok. `klinik_yedek` dışında BYPASSRLS rol yok. | | ☐ | | |
| 5 | A | — | **Migration rolü** — `deploy.env`'e `MIGRASYON_DATABASE_URL` yaz; `paket\deploy\windows\migrasyon-uygula.ps1 -Kontrol` | `Bekleyen migration yok.` (çıkış 0). `psql -U klinik_migrasyon -d klinik -c "select count(*) from hasta"` → `permission denied`. `select * from migrasyon.kayit` (SET ROLE klinik_sahip sonrası) → paketteki tüm dosyalar listelenir. | | ☐ | | |
| 6 | A | — | **Gizli dosyalar + açık anahtar** — `uygulama.env`, `bakim.env`, `yedek.env`, `deploy.env` oluştur (değerler prova değerleri; `uygulama.env`'e `GUNCELLEME_DURUM_DOSYASI=C:\klinik\durum\jeton.json`); `klinik.pub`'u `C:\klinik\anahtarlar\`'a kopyala (anahtar kimliğini geliştirici ile doğrula); `kurulum.ps1`'i tekrar çalıştır | `Izinler uygulandi: …`; `NT SERVICE` hesapları için "atlandi (henuz yok)" uyarısı normal. `runas /user:svc-klinik-bakim "cmd /c type C:\klinik\gizli\uygulama.env"` → **Erişim engellendi**. | | ☐ | | |
| 7 | A + B (son uygulama paketiyle) | ÖNCE: `03-db-kurulu` | **İlk sürüm** — `paket\deploy\windows\guncelle.ps1 -IlkKurulum -YerelPaket C:\klinik\ilk\klinik-<s1>.zip` (yanında `.sha256`, `.minisig`) | `SHA256 dogrulandi.` → `Imza dogrulandi (anahtar: klinik.pub).` → `On ucus tamam.` → `Bekleyen migration yok.` → `Ilk surum hazir: C:\klinik\surumler\<s1>-…`. `C:\klinik\guncel` junction'ı `SURUM.txt` ilk satırı `<s1>`. | | ☐ | | |
| 8 | A | SONRA: `04-servisler-hazir` | **Servisler** — `C:\klinik\guncel\deploy\windows\servis-kur.ps1 -AlanAdi localhost` | `klinik-uygulama hesabi: NT SERVICE\klinik-uygulama`, `klinik-caddy hesabi: NT SERVICE\klinik-caddy`; `Saglik kontrolu: TAMAM`; `Caddy yonetim uc noktasi kapali`. `sc.exe qc klinik-uygulama` → `SERVICE_START_NAME : NT SERVICE\klinik-uygulama`. `Get-Service klinik-*` → Running. `curl http://127.0.0.1:3000/api/saglik` → `{"durum":"ok",…,"db":"ok"}` (200). Uygulama hesabı kodu değiştiremez: `icacls C:\klinik\guncel\server.js` → uygulama hesabı yalnız `(RX)`. | | ☐ | | |
| 9 | B (giriş ve ekran akışları uygulama bitince); A'da yalnız açılış + /api/saglik | — | **Uygulama duman testi** — Tarayıcı `http://localhost`, klinik oluştur/giriş, PDF indir | Giriş çalışır, PDF üretilir, `/api/canli` bağlanır (canlı çizelge). | | ☐ | | |
| 10 | A + B (gerçek veri hacmiyle) | ÖNCE: `04-servisler-hazir` (geri dönüş noktası) | **Yedek** — `$env:...`/`yedek.env` hazır; `C:\klinik\guncel\deploy\windows\yedek.ps1` (svc-klinik-yedek ya da yönetici) | `Yedek tamam: <tarih>-gunluk`; `YEDEK_HEDEF_KLASOR`'de `.dump.age`, `.dosya.tar.age`, `.sha256`, ayın `…-aylik.*` kopyası; `.gecici` boş; dış kopya klasöründe aynı dosyalar. Çıkış 0, olay günlüğünde `Yedek tamam`. | | ☐ | | |
| 11 | A + B (gerçek veri hacmiyle) | Ayrı VM/küme kullan; yoksa ÖNCE checkpoint | **Temiz veritabanına geri yükleme** — Başka isimli boş küme/VM'de adım 2–3'ün **yalnız ilk üç SQL'i** (00/01/02), sonra `age -d … ; pg_restore --no-owner --role=klinik_sahip -d klinik --clean --if-exists klinik.dump` | `pg_restore` hata vermez (uyarı: yalnız "does not exist, skipping"). Satır sayıları kaynakla aynı; `migrasyon.kayit` dolu. | | ☐ | | |
| 12 | A + B | — | **Kontroller yeniden** — Adım 4'ün iki `.sql`'ini geri yüklenen veritabanında çalıştır | **Yine temiz.** FORCE RLS korunmuş: `select count(*) from hasta` (tenant bağlamsız, `klinik_uygulama` ile) → 0. Bozuk çıkarsa §11 "Denenmedi" maddesi gerçek sorundur → düzeltilir. | | ☐ | | |
| 13 | A (sahte uyumlu migration'lı paketle) + B (gerçek migration seti) | ÖNCE: `05-yedek-alindi` | **Yükseltme** — Yeni etiket `<s2>` üret ve `scripts/yayin-imzala.ps1` ile imzala (içinde **en az bir yeni, geriye dönük uyumlu migration**); `guncelle.ps1 -YerelPaket …\klinik-<s2>.zip` (GitHub + jeton varsa `-YerelPaket`siz) | `SHA256 dogrulandi.` → `Imza dogrulandi` → `On ucus tamam.` → `Bekleyen migration var → guncelleme oncesi yedek aliniyor.` → `>> 00NN_….sql` → `1 migration uygulandi; yetki kontrolleri temiz.` → `Guncelleme basarili: <s2>`. `SURUM.txt` = `<s2>`; `/api/saglik` 200; `surumler\` altında iki sürüm; yedek klasöründe `…-guncelleme-oncesi.*`. | | ☐ | | |
| 14 | A | — | **Bozuk özet reddi (imza geçerli olsa bile)** — `.sha256` dosyasının bir karakterini değiştir, `guncelle.ps1 -YerelPaket … -Zorla` | `HATA (dogrulama): SHA256 UYUSMUYOR` , çıkış 1; `guncel` değişmedi; yeni klasör açılmadı. | | ☐ | | |
| 15 | A | ÖNCE: `06-surum2-calisiyor` | **Geri dönüş (otomatik)** — Sağlıksız bir paket üret (örn. `uygulama.env`'de olmayan bir değişken isteyen ya da `/api/saglik`'i 503 yapan sürüm `<s3>`; ön uçuşu geçmesi için sağlık yalnız geçişten sonra bozulacak şekilde ya da ön uçuşu kapatarak `uygulama.env`'i geçici taşıyıp) ve `guncelle.ps1 -YerelPaket …<s3>` | Ön uçuş yakalarsa: `HATA (on-ucus)`, canlı değişmez, çıkış 1. Geçiş sonrası bozulursa: `HATA (gecis)` → `Onceki surume donuluyor` → `Geri donus basarili.`, çıkış 1; `SURUM.txt` yine `<s2>`; `/api/saglik` 200; olay günlüğünde `Error` kaydı. | | ☐ | | |
| 16 | A (şema uyumu) + B (gerçek migration'larla) | ÖNCE: `06-surum2-calisiyor` | **Elle geri dönüş + eski şema** — `guncelle.ps1 -Surum <s1>` GitHub ile ya da `-YerelPaket …<s1>` ile eski paket | Eski kod, yeni (genişletilmiş) şemada çalışır (`/api/saglik` 200, giriş çalışır) → geriye dönük uyum kuralının kanıtı. Çalışmazsa o migration kural dışıdır; §11 `guncelleme-oncesi` yedeğinden dönüş uygulanır ve adımı yeniden yazarsınız. | | ☐ | | |
| 17 | A | — | **Servis dayanıklılığı** — `Stop-Process -Name node -Force` (uygulama) ; 10 sn bekle | NSSM servisi yeniden başlatır; `/api/saglik` 200'e döner. Yedek hesabının `bakim.env`'i okuyamadığı doğrulanır. | | ☐ | | |
| 18 | A | — | **İmzasız paket reddi** — `.minisig` dosyasını sil (ya da imzasız bir zip + özet hazırla); `guncelle.ps1 -YerelPaket … -Zorla` | `HATA (yerel-paket): IMZA YOK … imzasiz paket REDDEDILDI` (GitHub yolunda: `HATA (indirme): IMZA YOK`), çıkış 1; `indirme\`de açılmış klasör YOK, `surumler\` değişmedi, `guncel` aynı; olay günlüğünde Error. | | ☐ | | |
| 19 | A | — | **Bozuk / değiştirilmiş paket ve yanlış anahtar** — (a) imzalı zip'in bir baytını değiştir **ve** `.sha256`'yı yeni özetle yeniden üret (SHA256'yı geçecek sahte paket); (b) geçerli bir paketi **başka** bir minisign anahtarıyla imzala | (a) `SHA256 dogrulandi.` geçer ama `HATA (imza): IMZA GECERSIZ … REDDEDILDI`; (b) aynı hata. Çıkış 1, olay **3501 Error**, paket açılmadı, canlı değişmedi. Bu adım SHA256'nın tek başına yetmediğini kanıtlar. | | ☐ | | |
| 20 | A | — | **Eski sürüm imzası yeni sürüm gibi** — `<s1>` paketinin zip + geçerli `.minisig`'ini `klinik-<s2>.zip` adıyla yeniden adlandırıp yerel paket olarak ver (özeti yeniden üret) | `HATA (imza): imzali yorum beklenenle (klinik-<s2>) uyusmuyor … reddedildi`. | | ☐ | | |
| 21 | A | ÖNCE: `07-imza-temel` | **Anahtar rotasyonu** — Yeni minisign çifti üret; yeni `.pub`'u eskisinin yanına koy; bir paketi **yeni** anahtarla imzala → kabul; sonra eski `.pub`'u sil ve **eski** anahtarla imzalı paketi ver → reddedilir | Çift anahtarla her iki imza da kabul; eski `.pub` silinince eski anahtarla imzalı paket `IMZA: guvenilen yayin acik anahtari yok` ya da `IMZA GECERSIZ` ile reddedilir. | | ☐ | | |
| 22 | A (gerçek GitHub deposu + jeton gerekir) | — | **Jeton ömrü ve reddi** — (a) `deploy.env`'de `GITHUB_TOKEN_SON_KULLANMA`'yı 7 gün sonrasına ayarla, GitHub yolunda `guncelle.ps1` çalıştır; (b) `GITHUB_DEPLOY_TOKEN`'ı bilerek bozuk yap ve çalıştır | (a) `UYARI: GitHub guncelleme jetonunun suresi 7 gun icinde doluyor`, olay **3010 Warning**, `durum\jeton.json` `sonKullanma` dolu, yerelde `/api/saglik` → `guncelleme_jetonu: "yaklasiyor"` + genel `durum: "uyari"` (HTTP 200), **dışarıdan (`X-Real-IP` ile) yalnız `{"durum":"uyari"}`**; (b) `HATA (surum-sorgu): JETON_REDDEDILDI …`, **çıkış kodu 3**, olay **3401 Error**, `jeton.json` `durum: reddedildi`, canlı sürüm değişmedi. Jetonu düzeltince bir sonraki çalışma `ok`a döner. | | ☐ | | |
| 23 | A (yerel görev hesapları); gerçek bakım görevleri Modül 7 sonrası B | ÖNCE: `00-temiz-os` ya da `02-kurulum-sonrasi` | **Görev hesapları** — `kurulum.ps1` çıktısındaki parolayı not et; `secpol.msc`'de hakları incele; `runas /user:svc-klinik-bakim cmd` ve Uzak Masaüstü ile oturum açmayı dene; Task Scheduler görevini bu hesapla kaydet ve çalıştır | Parola yalnız kurulum ekranında göründü (diskte/logda YOK); `Toplu iş olarak oturum aç`: hesap VAR; `Yerel olarak oturum açmayı reddet` ve `Uzak Masaüstü ile oturum açmayı reddet`: hesap VAR; `runas`/RDP reddedilir; zamanlanmış görev (toplu iş) çalışır. `kurulum.ps1 -ParolaSifirla` yeni parola gösterir, eskisi geçersiz olur. | | ☐ | | |

### 3.1 Genel sonuç özeti (prova bitince doldur)

| Tur | Toplam | Geçti | Kaldı | Atlandı | Not |
|---|---|---|---|---|---|
| A turu (dağıtım hattı) | 23 | | | | |
| B turu (uygulama bitince tekrar edilenler) | 9, 10–13, 16 (+ 4, 7–8) | | | | |

Prova tamam kriteri sağlandı mı? ☐ evet ☐ hayır — Gerekçe: …

---

## 4. Hata günlüğü

Her hata için bir satır: **tam hata mesajı** (parola/jeton/anahtar/kişisel veri içermeden), kök neden, çözüm, **betikte ya da dokümanda düzeltme gerekiyor mu** (Evet/Hayır + dosya) ve düzeltmenin commit'i. Düzeltme gerekiyorsa ilgili adım DÜZELTMEDEN SONRA yeniden koşulur ve yukarıdaki tabloda sonuç güncellenir.

| # | Adım | Hata mesajı (tam) | Kök neden | Çözüm | Betikte/dokümanda düzeltme gerekli mi? (Evet/Hayır → dosya) | Düzeltme commit'i | Tarih |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |

### 4.1 Prova sonrası temizlik kontrol listesi

- ☐ Prova için üretilen GitHub jetonu **iptal edildi**; `deploy.env` içindeki değerler silindi.
- ☐ Prova özel anahtarı ve deneme (21. adım) anahtar çiftleri güvenle silindi; **üretim anahtarı prova makinesine HİÇ girmedi**.
- ☐ Açık dump/tar dosyaları ve geri yüklenen deneme veritabanı silindi.
- ☐ Tüm checkpoint'ler birleştirilip silindi; VM üretime dönüştürülmedi (temiz kurulum yapılacak).
- ☐ Bulunan sapmalar `docs/sunucu-kurulum.md` (§8–§12) ve `deploy/windows/*.ps1` içine işlendi; `docs/tasima-plani.md` üretim kapısı #6 ve #13 güncellendi.

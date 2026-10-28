<#
 Sunucu hazırlığı (idempotent: tekrar çalıştırmak güvenli; olan şeye dokunmaz). Yönetici olarak çalıştırın.
 Yaptığı: saat dilimi, araç denetimi (Node LTS, Git, PostgreSQL istemci/sunucu, Caddy, NSSM, age, Chrome/Edge),
 klasör düzeni + NTFS izinleri, düşük yetkili servis hesapları, güvenlik duvarı (yalnız 80/443), olay günlüğü kaynağı.
 -Indir verilirse ve winget varsa eksik araçları winget ile kurar; yoksa eksikleri listeler (elle kurulum).
 Yapmadığı: veritabanı kurulumu (scripts\db-kur.ps1), servis kurulumu (servis-kur.ps1), gizli dosya OLUŞTURMA (env.production.ornek'ten elle).
 DENENMEDİ (Windows Server'da çalıştırılmadı). winget paket kimlikleri sürüme göre değişebilir; doğrulayın.
#>
param(
  [string]$KokDizin = "C:\klinik",
  [switch]$Indir
)
. "$PSScriptRoot\ortak.ps1"
YoneticiIste
$bilgisayar = $env:COMPUTERNAME

# 1) Saat dilimi: görev saatleri İstanbul saatidir (docs/sunucu-kurulum.md 3b).
if ((Get-TimeZone).Id -ne "Turkey Standard Time") { Set-TimeZone -Id "Turkey Standard Time"; Yazdir "Saat dilimi Turkey Standard Time yapıldı." }

# 2) Araçlar
$araclar = @(
  @{ Ad = "Node.js LTS (>=22)"; Komut = "node";    Winget = "OpenJS.NodeJS.LTS" },
  @{ Ad = "Git";                Komut = "git";     Winget = "Git.Git" },
  @{ Ad = "PostgreSQL (psql, pg_dump, pg_restore)"; Komut = "pg_dump"; Winget = "PostgreSQL.PostgreSQL.18" },
  @{ Ad = "Caddy";              Komut = "caddy";   Winget = "CaddyServer.Caddy" },
  @{ Ad = "NSSM";               Komut = "nssm";    Winget = "NSSM.NSSM" },
  @{ Ad = "age (yedek şifreleme)"; Komut = "age";  Winget = "FiloSottile.age" }
)
$eksik = @()
foreach ($a in $araclar) {
  if (-not (KomutVarMi $a.Komut) -and $Indir -and (KomutVarMi "winget")) {
    Yazdir "Kuruluyor: $($a.Ad)"
    & winget install --id $a.Winget -e --accept-package-agreements --accept-source-agreements --silent
  }
  if (KomutVarMi $a.Komut) { Yazdir "VAR   $($a.Ad)" } else { Yazdir "EKSİK $($a.Ad)"; $eksik += $a.Ad }
}
if (KomutVarMi "node") {
  $surum = [version]((& node -v).TrimStart("v"))
  if ($surum.Major -lt 22) { Yazdir "UYARI: Node $surum — repo .nvmrc 22 ve üzeri ister (--env-file için en az 20.6)."; $eksik += "Node >=22" }
}
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Yazdir "VAR   Chrome/Edge: $chrome  (uygulama.env > CHROMIUM_PATH bu yola ayarlanır)" } else { Yazdir "EKSİK Chrome veya Edge (PDF üretimi için)"; $eksik += "Chrome/Edge" }

# 3) Klasörler
$klasorler = "gizli", "kaynak", "surumler", "log", "dosya", "yedek", "yedek\.gecici", "caddy-veri"
foreach ($k in $klasorler) { New-Item -ItemType Directory -Force -Path (Join-Path $KokDizin $k) | Out-Null }

# 4) Servis hesapları (parola yalnız oluşturulurken sorulur; hiçbir yere yazılmaz). Etkileşimli oturum açma izni ayrıca kaldırılmalı
#    (Yerel Güvenlik İlkesi > "Yerel olarak oturum açmayı reddet"): betik bunu YAPMAZ, sunucu sertleştirme adımıdır.
foreach ($ad in "svc-klinik-uygulama", "svc-klinik-bakim", "svc-klinik-yedek") {
  if (Get-LocalUser -Name $ad -ErrorAction SilentlyContinue) { Yazdir "VAR   hesap $ad"; continue }
  $parola = Read-Host -AsSecureString "Yeni hesap '$ad' için parola (parola yöneticisine kaydedin)"
  New-LocalUser -Name $ad -Password $parola -PasswordNeverExpires -UserMayNotChangePassword -Description "Klinik Asistanı servis hesabı" | Out-Null
  Yazdir "OLUŞTU hesap $ad"
}

# 5) NTFS izinleri. Miras kapalı; yalnız ilgili hesap. (Dosya düzeyi gizli izinleri dosyalar varsa uygulanır; env dosyaları sonradan konunca betiği tekrar çalıştırın.)
function Izin([string]$Yol, [string[]]$Verilecekler) {
  & icacls $Yol /inheritance:r | Out-Null
  & icacls $Yol /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" | Out-Null
  foreach ($v in $Verilecekler) { & icacls $Yol /grant:r $v | Out-Null }
}
$u = "$bilgisayar\svc-klinik-uygulama"; $b = "$bilgisayar\svc-klinik-bakim"; $y = "$bilgisayar\svc-klinik-yedek"
Izin (Join-Path $KokDizin "gizli") @()
Izin (Join-Path $KokDizin "kaynak") @("${b}:(OI)(CI)RX")                       # bakım betikleri scripts\*.mjs'i buradan çalıştırır
Izin (Join-Path $KokDizin "surumler") @("${u}:(OI)(CI)RX")                     # uygulama kodu: SALT OKUNUR
Izin (Join-Path $KokDizin "log") @("${u}:(OI)(CI)M", "${b}:(OI)(CI)M", "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)M")
Izin (Join-Path $KokDizin "dosya") @("${u}:(OI)(CI)M", "${y}:(OI)(CI)RX")      # DOSYA_KOKU: uygulama yazar, yedek okur
Izin (Join-Path $KokDizin "yedek") @("${y}:(OI)(CI)M")
Izin (Join-Path $KokDizin "caddy-veri") @("NT AUTHORITY\LOCAL SERVICE:(OI)(CI)M")
foreach ($d in @(@("uygulama.env", $u, $b), @("bakim.env", $b, $u), @("yedek.env", $y, $null))) {
  $yol = Join-Path $KokDizin "gizli\$($d[0])"
  if (-not (Test-Path $yol)) { continue }
  & icacls $yol /inheritance:r | Out-Null
  & icacls $yol /grant:r "SYSTEM:F" "BUILTIN\Administrators:F" "$($d[1]):R" | Out-Null
  if ($d[2]) { & icacls $yol /deny "$($d[2]):(R,RX)" | Out-Null }
  Yazdir "İzinler uygulandı: $($d[0])"
}
# gizli klasöründe hesapların env dosyasına ulaşabilmesi için klasörde gezinme izni (içerik listelemeden)
& icacls (Join-Path $KokDizin "gizli") /grant "${u}:(X)" "${b}:(X)" "${y}:(X)" | Out-Null

# 6) Güvenlik duvarı: yalnız 80/443 gelen. Uygulama 127.0.0.1:3000'e bağlıdır, PostgreSQL localhost'tadır; onlara kural AÇILMAZ.
if (-not (Get-NetFirewallRule -DisplayName "Klinik HTTP-HTTPS" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "Klinik HTTP-HTTPS" -Direction Inbound -Protocol TCP -LocalPort 80, 443 -Action Allow | Out-Null
  Yazdir "Güvenlik duvarı: 80/443 açıldı."
}

# 7) Olay günlüğü kaynağı (yedek/güncelleme hataları buraya yazılır)
foreach ($kaynak in "KlinikYedek", "KlinikGuncelle") {
  if (-not [System.Diagnostics.EventLog]::SourceExists($kaynak)) { New-EventLog -LogName Application -Source $kaynak }
}

Yazdir "---"
if ($eksik.Count -gt 0) { Yazdir ("Eksikler (elle kurun, sonra bu betiği yeniden çalıştırın): " + ($eksik -join ", ")) } else { Yazdir "Tüm araçlar mevcut." }
Yazdir "Sıradaki: 1) scripts\db-kur.ps1 (veritabanı)  2) gizli env dosyalarını $KokDizin\gizli altına koy (deploy\windows\env.production.ornek)"
Yazdir "          3) bu betiği tekrar çalıştır (env izinleri)  4) git clone → $KokDizin\kaynak  5) guncelle.ps1 -IlkKurulum  6) servis-kur.ps1"

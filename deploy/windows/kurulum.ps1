<#
 Sunucu hazırlığı (idempotent: tekrar çalıştırmak güvenli; olan şeye dokunmaz). Yönetici olarak çalıştırın.
 Yaptığı: saat dilimi, araç denetimi (Node LTS, PostgreSQL araçları, Caddy, NSSM, age, Chrome/Edge — Git/derleme araçları GEREKMEZ: derleme CI'dadır),
   klasör düzeni + NTFS izinleri, bakım/yedek yerel hesapları, PostgreSQL sertleştirme (listen_addresses='localhost', pg_hba yalnız localhost + scram-sha-256,
   doğrulamalı), güvenlik duvarı (yalnız 80/443), olay günlüğü kaynakları.
 Servis hesapları (klinik-uygulama, klinik-caddy) SANAL hesaplardır (NT SERVICE\<servis>): parolası yok, burada oluşturulmaz; servis-kur.ps1 servisi kurunca
   izinleri uygular. Bu betik servislerden ÖNCE çalışırsa o hesapların izinleri atlanır (uyarı) — servis-kur.ps1 sonunda otomatik tamamlanır.
 -Indir verilirse ve winget varsa eksik araçları winget ile kurar; yoksa eksikleri listeler (elle kurulum).
 Yapmadığı: veritabanı kurulumu (scripts\db-kur.ps1), servis kurulumu (servis-kur.ps1), gizli dosya OLUŞTURMA (env.production.ornek'ten elle).
 -PgSertlestirAtla: PostgreSQL yapılandırmasına dokunma. -PgVeriDizini: veri dizini otomatik bulunamazsa elle ver.
 DENENMEDİ (Windows Server'da çalıştırılmadı). winget paket kimlikleri sürüme göre değişebilir; doğrulayın.
#>
param(
  [string]$KokDizin = "C:\klinik",
  [string]$PgVeriDizini = "",
  [switch]$Indir,
  [switch]$PgSertlestirAtla
)
. "$PSScriptRoot\ortak.ps1"
YoneticiIste
$bilgisayar = $env:COMPUTERNAME

# 1) Saat dilimi: görev saatleri İstanbul saatidir (docs/sunucu-kurulum.md 3b).
if ((Get-TimeZone).Id -ne "Turkey Standard Time") { Set-TimeZone -Id "Turkey Standard Time"; Yazdir "Saat dilimi Turkey Standard Time yapildi." }

# 2) Araçlar. Sunucuda npm/derleme YOK: Node yalnız uygulamayı (server.js) ve bakım betiklerini çalıştırır.
$araclar = @(
  @{ Ad = "Node.js LTS (>=22)"; Komut = "node";    Winget = "OpenJS.NodeJS.LTS" },
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
  if (KomutVarMi $a.Komut) { Yazdir "VAR   $($a.Ad)" } else { Yazdir "EKSIK $($a.Ad)"; $eksik += $a.Ad }
}
if (KomutVarMi "node") {
  $surum = [version]((& node -v).TrimStart("v"))
  if ($surum.Major -lt 22) { Yazdir "UYARI: Node $surum — paket Node 22 ve uzeri ister."; $eksik += "Node >=22" }
}
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Yazdir "VAR   Chrome/Edge: $chrome  (uygulama.env > CHROMIUM_PATH bu yola ayarlanir)" } else { Yazdir "EKSIK Chrome veya Edge (PDF uretimi icin)"; $eksik += "Chrome/Edge" }

# 3) Klasörler
foreach ($k in "gizli", "surumler", "indirme", "log", "dosya", "yedek", "yedek\.gecici", "caddy-veri") { New-Item -ItemType Directory -Force -Path (Join-Path $KokDizin $k) | Out-Null }

# 4) Yerel hesaplar: bakım ve yedek (Task Scheduler). Parola yalnız oluşturulurken sorulur, hiçbir yere yazılmaz.
#    Etkileşimli oturum açma izni ayrıca kaldırılmalı (Yerel Güvenlik İlkesi > "Yerel olarak oturum açmayı reddet"): sunucu sertleştirme adımıdır.
#    Servis hesapları burada YOK: NT SERVICE\klinik-uygulama ve NT SERVICE\klinik-caddy sanal hesaplardır (servis-kur.ps1).
foreach ($ad in "svc-klinik-bakim", "svc-klinik-yedek") {
  if (Get-LocalUser -Name $ad -ErrorAction SilentlyContinue) { Yazdir "VAR   hesap $ad"; continue }
  $parola = Read-Host -AsSecureString "Yeni hesap '$ad' icin parola (parola yoneticisine kaydedin)"
  New-LocalUser -Name $ad -Password $parola -PasswordNeverExpires -UserMayNotChangePassword -Description "Klinik Asistani zamanlanmis is hesabi" | Out-Null
  Yazdir "OLUSTU hesap $ad"
}

# 5) NTFS izinleri (ortak.ps1 > GizliIzinleriUygula). Çözülemeyen sanal hesaplar atlanır.
GizliIzinleriUygula $KokDizin

# 6) PostgreSQL sertleştirme: listen_addresses='localhost'; pg_hba.conf YALNIZ localhost + scram-sha-256 (+ geri kalanı reject); sonra DOĞRULA.
function PgSertlestir {
  $servis = Get-CimInstance Win32_Service -Filter "Name like 'postgresql%'" | Select-Object -First 1
  $veri = $PgVeriDizini
  if (-not $veri -and $servis -and $servis.PathName -match '-D\s+"?([^"]+?)"?(\s|$)') { $veri = $Matches[1] }
  if (-not $veri -or -not (Test-Path (Join-Path $veri "postgresql.conf"))) { Yazdir "UYARI: PostgreSQL veri dizini bulunamadi; -PgVeriDizini verin. Sertlestirme ATLANDI."; return $false }
  $conf = Join-Path $veri "postgresql.conf"; $hba = Join-Path $veri "pg_hba.conf"
  $utf8 = New-Object System.Text.UTF8Encoding($false)   # BOM'suz: pg_hba/postgresql.conf BOM'u okuyamaz
  $zaman = Get-Date -Format "yyyyMMdd-HHmmss"
  $degisti = $false

  # postgresql.conf: yönetilen blok (son tanım kazanır); eski blok silinip yeniden yazılır → idempotent
  $metin = [System.IO.File]::ReadAllText($conf)
  $temiz = [regex]::Replace($metin, "(?ms)\r?\n# >>> klinik-asistani.*?# <<< klinik-asistani\r?\n?", "`r`n")
  $blok = "`r`n# >>> klinik-asistani (kurulum.ps1 yonetir; elle degistirmeyin)`r`nlisten_addresses = 'localhost'`r`npassword_encryption = 'scram-sha-256'`r`n# <<< klinik-asistani`r`n"
  $yeni = $temiz.TrimEnd() + "`r`n" + $blok
  if ($yeni -ne $metin) { Copy-Item $conf "$conf.bak-$zaman"; [System.IO.File]::WriteAllText($conf, $yeni, $utf8); $degisti = $true; Yazdir "postgresql.conf guncellendi (yedek: .bak-$zaman)" }

  # pg_hba.conf: tamamı yazılır (docs/sunucu-kurulum.md §2 ile birebir). postgres süper kullanıcısı yalnız localhost'tan (ilk kurulum/bakım).
  $satirlar = @("# Klinik Asistani — kurulum.ps1 yazdi (docs/sunucu-kurulum.md §2). Elle degisiklik bir sonraki kurulum.ps1'de uzerine yazilir.",
                "# TYPE  DATABASE  USER             ADDRESS        METHOD")
  foreach ($ek in @(@("postgres", "postgres"), @("klinik", "postgres"), @("klinik", "klinik_uygulama"), @("klinik", "kimlik_rolu"), @("klinik", "bakim_rolu"), @("klinik", "klinik_yedek"), @("klinik", "klinik_migrasyon"))) {
    foreach ($adres in "127.0.0.1/32", "::1/128") { $satirlar += ("host    {0,-9} {1,-16} {2,-14} scram-sha-256" -f $ek[0], $ek[1], $adres) }
  }
  $satirlar += "host    all       all              0.0.0.0/0      reject"
  $satirlar += "host    all       all              ::/0           reject"
  $hbaYeni = ($satirlar -join "`r`n") + "`r`n"
  if (-not (Test-Path $hba) -or [System.IO.File]::ReadAllText($hba) -ne $hbaYeni) {
    if (Test-Path $hba) { Copy-Item $hba "$hba.bak-$zaman" }
    [System.IO.File]::WriteAllText($hba, $hbaYeni, $utf8); $degisti = $true; Yazdir "pg_hba.conf yazildi"
  }
  if ($degisti -and $servis) { Restart-Service -Name $servis.Name -Force; Start-Sleep -Seconds 5; Yazdir "PostgreSQL yeniden baslatildi." }

  # DOĞRULAMA 1: pg_hba.conf dosyası — her host satırı loopback + scram-sha-256 ya da reject
  $kotu = @()
  foreach ($satir in [System.IO.File]::ReadAllLines($hba)) {
    $t = $satir.Trim(); if ($t -eq "" -or $t.StartsWith("#")) { continue }
    $p = $t -split "\s+"
    if ($p[0] -notmatch "^host") { $kotu += "host disi satir: $t"; continue }
    $adresOk = $p[3] -in "127.0.0.1/32", "::1/128", "0.0.0.0/0", "::/0"
    $yontem = $p[4]
    if (-not $adresOk) { $kotu += "beklenmeyen adres: $t" }
    elseif ($yontem -eq "reject") { }
    elseif ($p[3] -in "0.0.0.0/0", "::/0") { $kotu += "uzak adres reject degil: $t" }
    elseif ($yontem -ne "scram-sha-256") { $kotu += "yontem scram-sha-256 degil: $t" }
  }
  if ($kotu.Count -gt 0) { throw ("pg_hba.conf dogrulamasi BASARISIZ:`n" + ($kotu -join "`n")) }
  # DOĞRULAMA 2: dinleyen adresler yalnız loopback
  $dis = Get-NetTCPConnection -State Listen -LocalPort 5432 -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -notin "127.0.0.1", "::1" }
  if ($dis) { throw "PostgreSQL loopback disinda dinliyor: $(($dis | ForEach-Object LocalAddress) -join ', ') (listen_addresses?)" }
  # DOĞRULAMA 3: 5432 için açık bir gelen güvenlik duvarı kuralı olmamalı
  $kural = Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow -ErrorAction SilentlyContinue | Where-Object { ($_ | Get-NetFirewallPortFilter).LocalPort -contains "5432" }
  if ($kural) { Yazdir ("UYARI: 5432 icin acik gelen guvenlik duvari kurali var: " + (($kural | ForEach-Object DisplayName) -join ", ") + " — devre disi birakin.") }
  Yazdir "PostgreSQL dogrulamasi TAMAM: yalniz localhost dinliyor, pg_hba yalniz localhost + scram-sha-256."
  return $true
}
if (-not $PgSertlestirAtla) { [void](PgSertlestir) } else { Yazdir "PostgreSQL sertlestirme atlandi (-PgSertlestirAtla)." }

# pgpass: süper kullanıcı kaydı BULUNMAMALI (migration klinik_migrasyon ile, jeton/parola deploy.env'de)
$pgpass = Join-Path $env:APPDATA "postgresql\pgpass.conf"
if ((Test-Path $pgpass) -and (Select-String -Path $pgpass -Pattern ":postgres:" -Quiet)) { Yazdir "UYARI: $pgpass icinde 'postgres' kullanicisi var — ilk kurulum bitince SILIN." }

# 7) Güvenlik duvarı: yalnız 80/443 gelen. Uygulama 127.0.0.1:3000'e bağlıdır, PostgreSQL localhost'tadır; onlara kural AÇILMAZ.
if (-not (Get-NetFirewallRule -DisplayName "Klinik HTTP-HTTPS" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "Klinik HTTP-HTTPS" -Direction Inbound -Protocol TCP -LocalPort 80, 443 -Action Allow | Out-Null
  Yazdir "Guvenlik duvari: 80/443 acildi."
}

# 8) Olay günlüğü kaynakları (yedek/güncelleme hataları buraya yazılır)
foreach ($kaynak in "KlinikYedek", "KlinikGuncelle") {
  if (-not [System.Diagnostics.EventLog]::SourceExists($kaynak)) { New-EventLog -LogName Application -Source $kaynak }
}

Yazdir "---"
if ($eksik.Count -gt 0) { Yazdir ("Eksikler (elle kurun, sonra bu betigi yeniden calistirin): " + ($eksik -join ", ")) } else { Yazdir "Tum araclar mevcut." }
Yazdir "Siradaki: 1) scripts\db-kur.ps1 (veritabani; super kullanici YALNIZ burada)  2) gizli env dosyalari $KokDizin\gizli altina (env.production.ornek: uygulama/bakim/yedek/deploy.env)"
Yazdir "          3) guncelle.ps1 -IlkKurulum  4) servis-kur.ps1 (sanal servis hesaplarinin izinlerini de tamamlar)"

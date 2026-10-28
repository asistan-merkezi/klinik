<#
 Uygulamayı ve Caddy'yi NSSM ile Windows servisi olarak kurar/günceller (idempotent: varsa ayarları yeniden yazar).
  - klinik-uygulama : `node --env-file=<gizli>\uygulama.env server.js` (standalone), hesap NT SERVICE\klinik-uygulama, 127.0.0.1:<Port>
  - klinik-caddy    : Caddy (TLS, alan adı), hesap NT SERVICE\klinik-caddy, yönetim uç noktası (admin) KAPALI
 Hesaplar SANAL SERVİS HESAPLARIDIR (NT SERVICE\<servis-adı>): parola YOK, parola yönetimi/rotasyonu YOK; Windows servis SID'inden türetir, yalnız o servise aittir.
 NSSM ObjectName ayarı:  nssm set <servis> ObjectName "NT SERVICE\<servis>"   (parola argümanı verilmez/boş)
   Bu betik ayarı yapar, `sc.exe qc` ile DOĞRULAR; NSSM kabul etmezse yedek yol: sc.exe config <servis> obj= "NT SERVICE\<servis>" (parolasız).
 Servis kurulunca hesaplar çözülebilir olur ve NTFS izinleri (ortak.ps1 > GizliIzinleriUygula) uygulanır:
   uygulama: surumler RX (kod salt-okunur), dosya + log yazma, uygulama.env okuma; caddy: caddy-veri + log yazma.
 Kullanım:  .\servis-kur.ps1 -AlanAdi klinik.firma.com.tr
 Önkoşul: kurulum.ps1 çalışmış, <Kok>\guncel mevcut (guncelle.ps1 -IlkKurulum), <Kok>\gizli\uygulama.env dolu.
 DENENMEDİ (Windows Server'da çalıştırılmadı): sanal hesapla NSSM ObjectName davranışı sunucuda doğrulanacak.
#>
param(
  [string]$KokDizin = "C:\klinik",
  [string]$AlanAdi,
  [int]$Port = 3000,
  [switch]$CaddyAtla
)
. "$PSScriptRoot\ortak.ps1"
YoneticiIste
if (-not (KomutVarMi "nssm")) { throw "nssm bulunamadi (kurulum.ps1)." }
$node = (Get-Command node).Source
$guncel = Join-Path $KokDizin "guncel"
$envDosyasi = Join-Path $KokDizin "gizli\uygulama.env"
$log = Join-Path $KokDizin "log"
if (-not (Test-Path (Join-Path $guncel "server.js"))) { throw "$guncel\server.js yok: once guncelle.ps1 -IlkKurulum calistirin." }
if (-not (Test-Path $envDosyasi)) { throw "$envDosyasi yok (env.production.ornek'ten olusturun)." }

function NssmAyar([string]$Servis, [string[]]$Ayar) { Calistir "nssm" (@("set", $Servis) + $Ayar) "nssm set $Servis $($Ayar[0])" }

function SanalHesapAyarla([string]$Servis) {
  $hesap = "NT SERVICE\$Servis"
  & nssm set $Servis ObjectName $hesap | Out-Null      # parolasız
  $qc = (& sc.exe qc $Servis) -join "`n"
  if ($qc -notmatch [regex]::Escape($hesap)) {
    Yazdir "nssm ObjectName kabul edilmedi; sc.exe config ile deneniyor."
    & sc.exe config $Servis obj= $hesap | Out-Null
    $qc = (& sc.exe qc $Servis) -join "`n"
    if ($qc -notmatch [regex]::Escape($hesap)) { throw "$Servis hesabi '$hesap' olarak ayarlanamadi (sc.exe qc ciktisini kontrol edin)." }
  }
  Yazdir "$Servis hesabi: $hesap"
}

function ServisHazirla([string]$Ad, [string]$Exe, [string]$Parametre, [string]$CalismaDizini) {
  if (-not (Get-Service -Name $Ad -ErrorAction SilentlyContinue)) {
    Calistir "nssm" @("install", $Ad, $Exe, $Parametre) "nssm install $Ad"
  } else {
    NssmAyar $Ad @("Application", $Exe)
    NssmAyar $Ad @("AppParameters", $Parametre)
  }
  NssmAyar $Ad @("AppDirectory", $CalismaDizini)
  NssmAyar $Ad @("Start", "SERVICE_AUTO_START")
  # Çökünce yeniden başlat: 5 sn gecikme; 10 sn'den kısa yaşayıp ölürse NSSM kendiliğinden yavaşlatır (kısır döngüde CPU yemez).
  NssmAyar $Ad @("AppExit", "Default", "Restart")
  NssmAyar $Ad @("AppRestartDelay", "5000")
  NssmAyar $Ad @("AppThrottle", "10000")
  NssmAyar $Ad @("AppStopMethodConsole", "15000")
  NssmAyar $Ad @("AppStopMethodThreads", "5000")
  # Log: stdout/stderr dosyalara, açıkken (online) döndürme, günde bir ya da 10 MB'ı geçince.
  NssmAyar $Ad @("AppStdout", (Join-Path $log "$Ad.log"))
  NssmAyar $Ad @("AppStderr", (Join-Path $log "$Ad.hata.log"))
  NssmAyar $Ad @("AppRotateFiles", "1")
  NssmAyar $Ad @("AppRotateOnline", "1")
  NssmAyar $Ad @("AppRotateSeconds", "86400")
  NssmAyar $Ad @("AppRotateBytes", "10485760")
  SanalHesapAyarla $Ad
}

# --- Uygulama servisi ---
$pgServis = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
ServisHazirla "klinik-uygulama" $node "--env-file=`"$envDosyasi`" server.js" $guncel
NssmAyar "klinik-uygulama" @("AppEnvironmentExtra", "NODE_ENV=production", "PORT=$Port", "HOSTNAME=127.0.0.1", "NEXT_TELEMETRY_DISABLED=1")
if ($pgServis) { NssmAyar "klinik-uygulama" @("DependOnService", $pgServis.Name) }

# --- Caddy servisi ---
if (-not $CaddyAtla) {
  $caddyfile = Join-Path $KokDizin "Caddyfile"
  if (-not (Test-Path $caddyfile)) {
    if (-not $AlanAdi) { throw "Caddyfile yok: -AlanAdi verin (or. klinik.firma.com.tr)." }
    (Get-Content (Join-Path $PSScriptRoot "Caddyfile") -Raw -Encoding UTF8).Replace("klinik.ornek.com.tr", $AlanAdi).Replace("localhost:3000", "127.0.0.1:$Port") | Set-Content -Path $caddyfile -Encoding UTF8
    Yazdir "Caddyfile olusturuldu: $caddyfile"
  } else { Yazdir "Mevcut Caddyfile korundu: $caddyfile (sablon degistiyse elle birlestirin)." }
  Calistir "caddy" @("validate", "--config", $caddyfile, "--adapter", "caddyfile") "caddy validate"
  $caddy = (Get-Command caddy).Source
  ServisHazirla "klinik-caddy" $caddy "run --config `"$caddyfile`" --adapter caddyfile" $KokDizin
  NssmAyar "klinik-caddy" @("AppEnvironmentExtra", "XDG_DATA_HOME=$(Join-Path $KokDizin 'caddy-veri')", "XDG_CONFIG_HOME=$(Join-Path $KokDizin 'caddy-veri')")
  NssmAyar "klinik-caddy" @("DependOnService", "klinik-uygulama")
}

# Servisler artık var → sanal hesaplar çözülür: NTFS izinlerini uygula (uygulama kodu salt-okunur, gizli dosyalar hesap bazlı).
GizliIzinleriUygula $KokDizin

foreach ($s in "klinik-uygulama", $(if (-not $CaddyAtla) { "klinik-caddy" })) {
  if (-not $s) { continue }
  if ((Get-Service $s).Status -eq "Running") { Restart-Service $s } else { Start-Service $s }
}
if (-not (SaglikBekle "http://127.0.0.1:$Port/api/saglik" 90)) { Yazdir "UYARI: /api/saglik 90 sn icinde 200 donmedi — $log\klinik-uygulama.hata.log dosyasina bakin."; exit 1 }
Yazdir "Saglik kontrolu: TAMAM"

# Caddy yönetim uç noktası (varsayılan 127.0.0.1:2019) KAPALI olmalı (Caddyfile global `admin off`).
if (-not $CaddyAtla) {
  Start-Sleep -Seconds 3
  if (Get-NetTCPConnection -State Listen -LocalPort 2019 -ErrorAction SilentlyContinue) { Yazdir "HATA: Caddy yonetim uc noktasi (2019) acik — Caddyfile'da global { admin off } olmali."; exit 1 }
  Yazdir "Caddy yonetim uc noktasi kapali (2019 dinlenmiyor)."
}

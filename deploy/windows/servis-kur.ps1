<#
 Uygulamayı ve Caddy'yi NSSM ile Windows servisi olarak kurar/günceller (idempotent: varsa ayarları yeniden yazar).
  - klinik-uygulama : `node --env-file=<gizli>\uygulama.env server.js` (standalone), düşük yetkili svc-klinik-uygulama hesabı, 127.0.0.1:<Port>
  - klinik-caddy    : Caddy (TLS, alan adı), NT AUTHORITY\LOCAL SERVICE
 Hesap parolası SecureString olarak sorulur; hiçbir dosyaya yazılmaz (NSSM bunu LSA/SCM'de saklar).
 Not: nssm komut satırı argümanı olarak parola geçer (kısa süre süreç listesinde görünebilir; sunucuya yalnız yöneticiler girer).
 Kullanım:  .\servis-kur.ps1 -AlanAdi klinik.firma.com.tr
 Önkoşul: kurulum.ps1 çalışmış, <Kok>\guncel mevcut (guncelle.ps1 -IlkKurulum ile oluşur), <Kok>\gizli\uygulama.env dolu.
 DENENMEDİ (Windows Server'da çalıştırılmadı).
#>
param(
  [string]$KokDizin = "C:\klinik",
  [string]$AlanAdi,
  [int]$Port = 3000,
  [string]$UygulamaHesabi = "svc-klinik-uygulama",
  [switch]$CaddyAtla
)
. "$PSScriptRoot\ortak.ps1"
YoneticiIste
if (-not (KomutVarMi "nssm")) { throw "nssm bulunamadı (kurulum.ps1)." }
$node = (Get-Command node).Source
$guncel = Join-Path $KokDizin "guncel"
$envDosyasi = Join-Path $KokDizin "gizli\uygulama.env"
$log = Join-Path $KokDizin "log"
if (-not (Test-Path (Join-Path $guncel "server.js"))) { throw "$guncel\server.js yok: önce guncelle.ps1 -IlkKurulum çalıştırın." }
if (-not (Test-Path $envDosyasi)) { throw "$envDosyasi yok (env.production.ornek'ten oluşturun)." }

function NssmAyar([string]$Servis, [string[]]$Ayar) { Calistir "nssm" (@("set", $Servis) + $Ayar) "nssm set $Servis $($Ayar[0])" }

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
  # Durdururken önce nazik kapanış (Ctrl+C) dene, sonra zorla.
  NssmAyar $Ad @("AppStopMethodConsole", "15000")
  NssmAyar $Ad @("AppStopMethodThreads", "5000")
  # Log: stdout/stderr dosyalara, açıkken (online) döndürme, günde bir ya da 10 MB'ı geçince.
  NssmAyar $Ad @("AppStdout", (Join-Path $log "$Ad.log"))
  NssmAyar $Ad @("AppStderr", (Join-Path $log "$Ad.hata.log"))
  NssmAyar $Ad @("AppRotateFiles", "1")
  NssmAyar $Ad @("AppRotateOnline", "1")
  NssmAyar $Ad @("AppRotateSeconds", "86400")
  NssmAyar $Ad @("AppRotateBytes", "10485760")
}

# --- Uygulama servisi ---
$pgServis = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
ServisHazirla "klinik-uygulama" $node "--env-file=`"$envDosyasi`" server.js" $guncel
NssmAyar "klinik-uygulama" @("AppEnvironmentExtra", "NODE_ENV=production", "PORT=$Port", "HOSTNAME=127.0.0.1", "NEXT_TELEMETRY_DISABLED=1")
if ($pgServis) { NssmAyar "klinik-uygulama" @("DependOnService", $pgServis.Name) }
$parola = Read-Host -AsSecureString "'$UygulamaHesabi' hesabının parolası"
$duz = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($parola))
try { Calistir "nssm" @("set", "klinik-uygulama", "ObjectName", "$env:COMPUTERNAME\$UygulamaHesabi", $duz) "nssm set ObjectName" } finally { $duz = $null }
Yazdir "klinik-uygulama hazır."

# --- Caddy servisi ---
if (-not $CaddyAtla) {
  $caddyfile = Join-Path $KokDizin "Caddyfile"
  if (-not (Test-Path $caddyfile)) {
    if (-not $AlanAdi) { throw "Caddyfile yok: -AlanAdi verin (ör. klinik.firma.com.tr)." }
    (Get-Content (Join-Path $PSScriptRoot "Caddyfile") -Raw -Encoding UTF8).Replace("klinik.ornek.com.tr", $AlanAdi).Replace("localhost:3000", "127.0.0.1:$Port") | Set-Content -Path $caddyfile -Encoding UTF8
    Yazdir "Caddyfile oluşturuldu: $caddyfile"
  } else { Yazdir "Mevcut Caddyfile korundu: $caddyfile (şablon değiştiyse elle birleştirin)." }
  Calistir "caddy" @("validate", "--config", $caddyfile, "--adapter", "caddyfile") "caddy validate"
  $caddy = (Get-Command caddy).Source
  ServisHazirla "klinik-caddy" $caddy "run --config `"$caddyfile`" --adapter caddyfile" $KokDizin
  NssmAyar "klinik-caddy" @("AppEnvironmentExtra", "XDG_DATA_HOME=$(Join-Path $KokDizin 'caddy-veri')", "XDG_CONFIG_HOME=$(Join-Path $KokDizin 'caddy-veri')")
  NssmAyar "klinik-caddy" @("ObjectName", "NT AUTHORITY\LocalService")
  NssmAyar "klinik-caddy" @("DependOnService", "klinik-uygulama")
  Yazdir "klinik-caddy hazır."
}

foreach ($s in "klinik-uygulama", $(if (-not $CaddyAtla) { "klinik-caddy" })) {
  if (-not $s) { continue }
  if ((Get-Service $s).Status -eq "Running") { Restart-Service $s } else { Start-Service $s }
}
if (SaglikBekle "http://127.0.0.1:$Port/api/saglik" 90) { Yazdir "Sağlık kontrolü: TAMAM" } else { Yazdir "UYARI: /api/saglik 90 sn içinde 200 dönmedi — $log\klinik-uygulama.hata.log dosyasına bakın."; exit 1 }

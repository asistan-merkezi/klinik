<#
 Bakim gorevlerini Windows Task Scheduler'a kaydeder (Modul 7). HTTP cron route'u ve CRON_SECRET YOKTUR: isler `node` ile tek dosyalik betiklerdir
 (pakette bakim\*.mjs; kaynak scripts\bakim\*.ts, `npm run bakim:derle`). Gorevler svc-klinik-bakim yerel hesabiyla "oturum acilsa da acilmasa da"
 (toplu is) calisir; ortam degiskenleri C:\klinik\gizli\bakim.env dosyasindan `node --env-file` ile okunur (DEGERLER hicbir gorev tanimina yazilmaz).

 Zamanlamalar (sunucu saat dilimi Turkey Standard Time = UTC+3; eski Vercel cron'lari UTC idi, esdegeri):
   audit-log-bolum-olustur          ayin 1'i 05:00   (eski "0 2 1 * *")
   personel-donem-otomatik-kapat    ayin 1'i 06:00   (eski "0 3 1 * *")
   resmi-tatil-guncelle             ayin 1'i 07:00   (eski "0 4 1 * *")
   temizlik                         her gun 04:30    (islem_anahtari 2 gunden eski + suresi dolmus bildirim baglantilari)
   mesaj-kuyruk-isle                5 dakikada bir   (kuyruk + randevu hatirlatma taramasi)
   kredi-senkron                    saatte bir       (merkez bakiyesi -> yerel yansima)
 Her gorev: ayni anda tek ornek (IgnoreNew), kacan calistirma acilista telafi edilir (StartWhenAvailable), zaman asimi vardir.
 Betikler idempotenttir; cikis kodu 0 = tamam, 1 = bazi kayitlar hatali (gorev "son sonuc" = 1), 2 = betik calisamadi. Gunluk: C:\klinik\log\bakim\<is>.log (JSON satirlari).

 Kullanim (yonetici PowerShell):
   .\gorevleri-kur.ps1                    # parola sorulur (kurulum.ps1 ciktisindaki svc-klinik-bakim parolasi)
   .\gorevleri-kur.ps1 -OnIzleme          # kaydetmeden gorev tanimlarini yazdirir (yonetici/parola gerekmez)
   .\gorevleri-kur.ps1 -Kaldir            # gorevleri siler
#>
param(
  [string]$KokDizin = "C:\klinik",
  [string]$Hesap = "svc-klinik-bakim",
  [string]$NodeYolu = "",
  [string]$BetikKlasoru = "",
  [string]$EnvDosyasi = "",
  [switch]$OnIzleme,
  [switch]$Kaldir
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$GorevKlasoru = "\Klinik\"
if (-not $BetikKlasoru) { $BetikKlasoru = Join-Path $KokDizin "guncel\bakim" }
if (-not $EnvDosyasi) { $EnvDosyasi = Join-Path $KokDizin "gizli\bakim.env" }
$LogKlasoru = Join-Path $KokDizin "log\bakim"

# ad, tur, saat ("HH:mm"), dakika araligi (sik), zaman asimi (dk)
$Gorevler = @(
  @{ Ad = "audit-log-bolum-olustur";       Tur = "aylik";  Saat = "05:00"; Aralik = 0;  Sinir = 15 },
  @{ Ad = "personel-donem-otomatik-kapat"; Tur = "aylik";  Saat = "06:00"; Aralik = 0;  Sinir = 60 },
  @{ Ad = "resmi-tatil-guncelle";          Tur = "aylik";  Saat = "07:00"; Aralik = 0;  Sinir = 15 },
  @{ Ad = "temizlik";                      Tur = "gunluk"; Saat = "04:30"; Aralik = 0;  Sinir = 30 },
  @{ Ad = "mesaj-kuyruk-isle";             Tur = "sik";    Saat = "00:00"; Aralik = 5;  Sinir = 10 },
  @{ Ad = "kredi-senkron";                 Tur = "sik";    Saat = "00:30"; Aralik = 60; Sinir = 20 }
)

function AylikTetikleyici([string]$Saat) {
  # New-ScheduledTaskTrigger -Monthly yok (PS 5.1): MSFT_TaskMonthlyTrigger dogrudan olusturulur. DaysOfMonth bit maskesi: 1. gun = 1; MonthsOfYear 4095 = tum aylar.
  $sinir = (Get-Date).Date.AddMonths(1)
  $sinir = Get-Date -Year $sinir.Year -Month $sinir.Month -Day 1 -Hour ([int]$Saat.Split(":")[0]) -Minute ([int]$Saat.Split(":")[1]) -Second 0 -Millisecond 0
  $t = New-CimInstance -ClientOnly -Namespace "Root/Microsoft/Windows/TaskScheduler" -ClassName "MSFT_TaskMonthlyTrigger" -Property @{
    DaysOfMonth = [uint32]1; MonthsOfYear = [uint16]4095; StartBoundary = $sinir.ToString("yyyy-MM-ddTHH:mm:ss"); Enabled = $true
  }
  return $t
}

function TetikleyiciUret($g) {
  switch ($g.Tur) {
    "aylik"  { return AylikTetikleyici $g.Saat }
    "gunluk" { return New-ScheduledTaskTrigger -Daily -At $g.Saat }
    "sik"    {
      $t = New-ScheduledTaskTrigger -Once -At $g.Saat -RepetitionInterval (New-TimeSpan -Minutes $g.Aralik)
      return $t
    }
  }
}

if ($Kaldir) {
  foreach ($g in $Gorevler) {
    $mevcut = Get-ScheduledTask -TaskPath $GorevKlasoru -TaskName $g.Ad -ErrorAction SilentlyContinue
    if ($mevcut) { Unregister-ScheduledTask -TaskPath $GorevKlasoru -TaskName $g.Ad -Confirm:$false; Write-Host "Silindi: $($g.Ad)" }
  }
  return
}

if (-not $NodeYolu) {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "node.exe bulunamadi: -NodeYolu verin (Node.js LTS kurulu olmali)." }
  $NodeYolu = $cmd.Source
}
if (-not $OnIzleme) {
  if (-not (Test-Path $NodeYolu)) { throw "Node yolu yok: $NodeYolu" }
  foreach ($g in $Gorevler) { if (-not (Test-Path (Join-Path $BetikKlasoru "$($g.Ad).mjs"))) { throw "Betik yok: $(Join-Path $BetikKlasoru "$($g.Ad).mjs") (paketteki bakim\ klasoru)." } }
  if (-not (Test-Path $EnvDosyasi)) { throw "Env dosyasi yok: $EnvDosyasi (deploy\windows\env.production.ornek > bakim.env)." }
  $yonetici = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $yonetici) { throw "Yonetici PowerShell gerekli." }
  New-Item -ItemType Directory -Force -Path $LogKlasoru | Out-Null
}

$parolaDuz = $null
if (-not $OnIzleme) {
  $guvenli = Read-Host -AsSecureString "$Hesap parolasi (kurulum.ps1 ciktisi; diske/loga yazilmaz)"
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($guvenli)
  try { $parolaDuz = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
$kullanici = "$env:COMPUTERNAME\$Hesap"

foreach ($g in $Gorevler) {
  $betik = Join-Path $BetikKlasoru "$($g.Ad).mjs"
  # Log klasoru ve diger ayarlar bakim.env icindedir (BAKIM_LOG_KLASORU=C:\klinik\logakim); gorev tanimina yalnizca yollar yazilir.
  $arguman = "--env-file=`"$EnvDosyasi`" `"$betik`""
  $eylem = New-ScheduledTaskAction -Execute $NodeYolu -Argument $arguman -WorkingDirectory (Split-Path -Parent $BetikKlasoru)
  $tetik = TetikleyiciUret $g
  $ayar = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes $g.Sinir) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  if ($OnIzleme) {
    Write-Host ("[onizleme] {0}{1}  tetik={2} {3}{4}  zaman asimi={5} dk" -f $GorevKlasoru, $g.Ad, $g.Tur, $g.Saat, $(if ($g.Aralik) { " /$($g.Aralik) dk" } else { "" }), $g.Sinir)
    Write-Host "           $NodeYolu $arguman"
    continue
  }
  $gorev = New-ScheduledTask -Action $eylem -Trigger $tetik -Settings $ayar
  Register-ScheduledTask -TaskPath $GorevKlasoru -TaskName $g.Ad -InputObject $gorev -User $kullanici -Password $parolaDuz -RunLevel Limited -Force | Out-Null
  Write-Host "Kaydedildi: $GorevKlasoru$($g.Ad)"
}
$parolaDuz = $null
if ($OnIzleme) { Write-Host "Onizleme tamam: hicbir gorev kaydedilmedi." } else { Write-Host "Tamam. Denemek icin: schtasks /Run /TN `"$($GorevKlasoru)mesaj-kuyruk-isle`"  ve son sonuc: Get-ScheduledTaskInfo" }

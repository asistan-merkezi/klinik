<#
 Pull tabanlı dağıtım (sunucudan dışarı bağlanır; sunucuya gelen yönetim bağlantısı yok). Task Scheduler ile tetiklenir.
 Akış:  git fetch/ff-only → temiz mi? → npm ci → npm run build (standalone) → yeni sürüm klasörü → yeni sürümü ayrı portta aç ve /api/saglik doğrula
        → bekleyen migration varsa güncelleme öncesi yedek + migrasyon-uygula.ps1 → "guncel" bağlantısını yeni sürüme çevir → servisi yeniden başlat
        → /api/saglik 200 değilse ÖNCEKİ SÜRÜME DÖN (bağlantıyı geri çevir, servisi yeniden başlat, git'i eski commit'e al).
 Sürüm düzeni:  <Kok>\kaynak (git deposu, yalnız derleme)  <Kok>\surumler\<tarih>-<sha> (çalışan paket)  <Kok>\guncel (junction → çalışan sürüm)
 Geri alma sınırı: migration'lar ileri yönlüdür. Kod geri dönse de veritabanı yeni şemada kalır; migration'lar geriye dönük uyumlu yazılmalı.
   Uyumsuzsa "docs/sunucu-kurulum.md > Yedekten dönme": güncelleme öncesi alınan yedek (etiket: guncelleme-oncesi) geri yüklenir.
 Çıkış kodu: 0 başarılı/yapacak iş yok · 1 hata, önceki sürüme dönüldü · 2 hata ve geri dönüş de başarısız (MÜDAHALE GEREKİR).
 Kullanım:
   .\guncelle.ps1                          normal güncelleme (yeni commit yoksa hiçbir şey yapmaz)
   .\guncelle.ps1 -IlkKurulum              ilk sürümü oluşturur (servis henüz yok; servis-kur.ps1 sonra çalışır)
   .\guncelle.ps1 -Zorla                   yeni commit olmasa da yeniden derle/dağıt
   .\guncelle.ps1 -GorevKaydet -GorevSaati 04:00 -GorevHesabi <hesap>   Task Scheduler görevi kaydeder (günlük)
 Gerekli: yönetici hakkı olan bir hesap (servis yeniden başlatma, junction), git erişimi (kaynak deposuna salt-okunur deploy anahtarı/jeton),
   süper kullanıcı parolası (PGPASSWORD veya bu hesabın pgpass.conf'u) — yalnız migration için.
 DENENMEDİ (Windows Server'da çalıştırılmadı).
#>
param(
  [string]$KokDizin = "C:\klinik",
  [string]$Dal = "",
  [int]$Port = 3000,
  [int]$DenemePort = 3999,
  [int]$SonSurumSayisi = 5,
  [string]$SuperKullanici = "postgres",
  [switch]$IlkKurulum,
  [switch]$Zorla,
  [switch]$GorevKaydet,
  [string]$GorevSaati = "04:00",
  [string]$GorevHesabi = ""
)
. "$PSScriptRoot\ortak.ps1"
YoneticiIste

if ($GorevKaydet) {
  if (-not $GorevHesabi) { throw "-GorevHesabi gerekli (yönetici hakkı olan hesap)." }
  $parola = Read-Host -AsSecureString "'$GorevHesabi' parolası"
  $duz = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($parola))
  $eylem = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -KokDizin `"$KokDizin`""
  $tetik = New-ScheduledTaskTrigger -Daily -At $GorevSaati
  $ayar = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable
  try {
    Register-ScheduledTask -TaskName "Klinik-Guncelle" -Action $eylem -Trigger $tetik -Settings $ayar -User $GorevHesabi -Password $duz -RunLevel Highest -Force | Out-Null
  } finally { $duz = $null }
  Yazdir "Görev kaydedildi: Klinik-Guncelle (her gün $GorevSaati). Sık kontrol için tetikleyiciyi Task Scheduler'dan düzenleyin (yeni commit yoksa betik hiçbir şey yapmaz)."
  exit 0
}

$kaynak = Join-Path $KokDizin "kaynak"
$surumler = Join-Path $KokDizin "surumler"
$guncel = Join-Path $KokDizin "guncel"
$log = Join-Path $KokDizin "log"
$envDosyasi = Join-Path $KokDizin "gizli\uygulama.env"
$servis = "klinik-uygulama"
$saglik = "http://127.0.0.1:$Port/api/saglik"

function OlayYaz([string]$Tip, [string]$Mesaj) {
  try { Write-EventLog -LogName Application -Source "KlinikGuncelle" -EntryType $Tip -EventId 3000 -Message $Mesaj } catch { }
}

$kilit = KilitAl (Join-Path $log "guncelle.kilit")
if ($null -eq $kilit) { Yazdir "Başka bir güncelleme çalışıyor; çıkılıyor."; exit 0 }
Start-Transcript -Path (Join-Path $log ("guncelle-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))) | Out-Null

$eskiSha = $null; $onceki = $null; $yeniSurum = $null; $anahtar = "baslangic"; $guncelDegisti = $false
function JunctionHedefi {
  if (-not (Test-Path $guncel)) { return $null }
  return [string]@((Get-Item $guncel).Target)[0]
}
function JunctionAyarla([string]$Hedef) {
  if (Test-Path $guncel) { & cmd.exe /c rmdir "`"$guncel`"" | Out-Null }   # yalnız bağlantıyı siler, hedefe dokunmaz
  New-Item -ItemType Junction -Path $guncel -Target $Hedef | Out-Null
}
function Robo([string]$Kaynak, [string]$Hedef) {
  & robocopy $Kaynak $Hedef /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy başarısız: $Kaynak" }
  $global:LASTEXITCODE = 0
}

try {
  Set-Location $kaynak
  if (-not $Dal) { $Dal = (& git rev-parse --abbrev-ref HEAD).Trim() }
  if ((& git status --porcelain)) { throw "Kaynak deposu temiz değil (elle değişiklik var); deploy deposuna elle dokunulmaz." }
  $eskiSha = (& git rev-parse HEAD).Trim()

  $anahtar = "git"
  Calistir "git" @("fetch", "origin", $Dal) "git fetch"
  $yeniSha = (& git rev-parse "origin/$Dal").Trim()
  $varOlanSurum = JunctionHedefi
  if (-not $Zorla -and -not $IlkKurulum -and $yeniSha -eq $eskiSha -and $varOlanSurum) { Yazdir "Yeni commit yok ($($eskiSha.Substring(0,7))); yapılacak iş yok."; exit 0 }
  if ((& git rev-parse --abbrev-ref HEAD).Trim() -ne $Dal) { Calistir "git" @("checkout", $Dal) "git checkout" }
  Calistir "git" @("merge", "--ff-only", "origin/$Dal") "git merge --ff-only (dal ayrışmış olabilir)"
  Yazdir "Hedef commit: $($yeniSha.Substring(0,7)) (önceki: $($eskiSha.Substring(0,7)))"

  $anahtar = "derleme"
  $env:NEXT_TELEMETRY_DISABLED = "1"
  Calistir "npm" @("ci", "--no-audit", "--no-fund") "npm ci"
  Calistir "npm" @("run", "build") "npm run build"
  if (-not (Test-Path (Join-Path $kaynak ".next\standalone\server.js"))) { throw "Derleme çıktısı yok: .next\standalone\server.js (next.config.ts output: standalone?)" }

  $anahtar = "paketleme"
  $yeniSurum = Join-Path $surumler ("{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $yeniSha.Substring(0, 7))
  Robo (Join-Path $kaynak ".next\standalone") $yeniSurum
  Robo (Join-Path $kaynak ".next\static") (Join-Path $yeniSurum ".next\static")
  if (Test-Path (Join-Path $kaynak "public")) { Robo (Join-Path $kaynak "public") (Join-Path $yeniSurum "public") }

  # Ön uçuş: yeni paket canlıya DOKUNMADAN ayrı portta açılıp /api/saglik doğrulanır (açılmayan paket canlıya hiç gitmez).
  if (Test-Path $envDosyasi) {
    $anahtar = "on-ucus"
    $eskiPort = $env:PORT; $eskiHost = $env:HOSTNAME; $eskiEnv = $env:NODE_ENV
    $env:PORT = "$DenemePort"; $env:HOSTNAME = "127.0.0.1"; $env:NODE_ENV = "production"
    $deneme = Start-Process -FilePath (Get-Command node).Source -ArgumentList "--env-file=`"$envDosyasi`"", "server.js" -WorkingDirectory $yeniSurum -PassThru -WindowStyle Hidden
    try {
      $env:PORT = $eskiPort; $env:HOSTNAME = $eskiHost; $env:NODE_ENV = $eskiEnv
      if (-not (SaglikBekle "http://127.0.0.1:$DenemePort/api/saglik" 60)) { throw "Yeni sürüm ön uçuşta açılmadı/sağlıksız (port $DenemePort)." }
    } finally { Stop-Process -Id $deneme.Id -Force -ErrorAction SilentlyContinue }
    Yazdir "Ön uçuş tamam."
  }

  $anahtar = "migrasyon"
  & "$PSScriptRoot\migrasyon-uygula.ps1" -KokDizin $kaynak -SuperKullanici $SuperKullanici -Kontrol
  if ($LASTEXITCODE -eq 10) {
    Yazdir "Bekleyen migration var → güncelleme öncesi yedek alınıyor."
    & "$PSScriptRoot\yedek.ps1" -KokDizin $KokDizin -Etiket "guncelleme-oncesi"
    if ($LASTEXITCODE -ne 0) { throw "Güncelleme öncesi yedek alınamadı; migration UYGULANMADI." }
    & "$PSScriptRoot\migrasyon-uygula.ps1" -KokDizin $kaynak -SuperKullanici $SuperKullanici
    if ($LASTEXITCODE -ne 0) { throw "Migration başarısız (dosya başına atomik; canlı sürüm DEĞİŞMEDİ)." }
  } elseif ($LASTEXITCODE -ne 0) { throw "Migration kontrolü başarısız (çıkış $LASTEXITCODE)." }

  $anahtar = "gecis"
  $onceki = JunctionHedefi
  $guncelDegisti = $true
  JunctionAyarla $yeniSurum
  if ($IlkKurulum) { Yazdir "İlk sürüm hazır: $yeniSurum. Sıradaki: servis-kur.ps1"; OlayYaz "Information" "İlk kurulum sürümü: $yeniSurum"; exit 0 }
  Restart-Service $servis
  if (-not (SaglikBekle $saglik 90)) { throw "Yeni sürüm sağlık kontrolünden geçmedi ($saglik)." }

  Yazdir "Güncelleme başarılı: $yeniSurum"
  OlayYaz "Information" "Güncelleme başarılı: $yeniSurum (commit $($yeniSha.Substring(0,7)))"
  # Eski sürümleri temizle: en yeni N + çalışan + bir önceki kalsın.
  $koru = @($yeniSurum, $onceki) | Where-Object { $_ }
  Get-ChildItem $surumler -Directory | Sort-Object Name -Descending | Select-Object -Skip $SonSurumSayisi |
    Where-Object { $koru -notcontains $_.FullName } | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  exit 0
}
catch {
  $hata = $_.Exception.Message
  Yazdir "HATA ($anahtar): $hata"
  $cikis = 1
  if ($guncelDegisti -and $onceki) {
    Yazdir "Önceki sürüme dönülüyor: $onceki"
    try {
      JunctionAyarla $onceki
      Restart-Service $servis
      if (SaglikBekle $saglik 90) { Yazdir "Geri dönüş başarılı." } else { Yazdir "GERİ DÖNÜŞ SAĞLIKSIZ — elle müdahale edin."; $cikis = 2 }
    } catch { Yazdir "Geri dönüş BAŞARISIZ: $($_.Exception.Message)"; $cikis = 2 }
  }
  if ($eskiSha) { try { Set-Location $kaynak; & git reset --hard $eskiSha | Out-Null } catch { } }   # sonraki çalışma aynı commit'i yeniden denesin
  if ($yeniSurum -and (Test-Path $yeniSurum) -and $cikis -eq 1) { Remove-Item $yeniSurum -Recurse -Force -ErrorAction SilentlyContinue }
  OlayYaz "Error" "Güncelleme başarısız ($anahtar): $hata. Çıkış kodu $cikis."
  exit $cikis
}
finally {
  try { Stop-Transcript | Out-Null } catch { }
  if ($kilit) { $kilit.Dispose() }
}

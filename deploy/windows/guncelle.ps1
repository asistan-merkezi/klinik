<#
 Pull tabanlı dağıtım (sunucudan dışarı bağlanır; sunucuya gelen yönetim bağlantısı yok). Task Scheduler ile tetiklenir.
 DERLEME SUNUCUDA YAPILMAZ: sürüm paketi GitHub Actions'ta (.github/workflows/derle.yml) derlenir ve GitHub sürüm eki (klinik-<sürüm>.zip + .sha256) olur.
 Sunucuda git, npm ci, next build ÇALIŞMAZ; yalnız Node (server.js), PostgreSQL araçları ve bu betikler gerekir.
 Akış:  son sürümü sorgula (salt-okunur jeton) → zip + .sha256 indir → SHA256 DOĞRULA → <Kok>\surumler\<sürüm>-<zaman>'a aç → paket denetimi
        → yeni sürümü ayrı portta aç, /api/saglik doğrula (ön uçuş) → bekleyen migration varsa güncelleme öncesi yedek + migrasyon-uygula.ps1
        → "guncel" bağlantısını yeni sürüme çevir → servisi yeniden başlat → /api/saglik değilse ÖNCEKİ SÜRÜME DÖN.
 Sürüm düzeni:  <Kok>\surumler\<sürüm>-<zaman> (çalışan paket)  <Kok>\guncel (junction → çalışan sürüm)  <Kok>\indirme (geçici, yalnız yönetici)
 Jeton: <Kok>\gizli\deploy.env (GITHUB_REPO, GITHUB_DEPLOY_TOKEN, MIGRASYON_DATABASE_URL). Jeton YALNIZ api.github.com'a gönderilir; depolama yönlendirmesine gönderilmez.
 Ağ çıkışı: yalnız GitHub'a 443 (api.github.com + yayın eki depolama adresi; docs/sunucu-kurulum.md §10).
 Geri alma sınırı: migration'lar ileri yönlüdür. Kod geri dönse de veritabanı yeni şemada kalır; migration'lar geriye dönük uyumlu yazılır (CLAUDE.md "Migration kuralları").
   Uyumsuzsa "docs/sunucu-kurulum.md > Yedekten dönme": güncelleme öncesi alınan yedek (etiket: guncelleme-oncesi) geri yüklenir.
 Çıkış kodu: 0 başarılı/yapacak iş yok · 1 hata, önceki sürüme dönüldü (ya da hiç değişmedi) · 2 hata ve geri dönüş de başarısız (MÜDAHALE GEREKİR).
 Kullanım:
   .\guncelle.ps1                          son sürüm farklıysa güncelle (aynıysa hiçbir şey yapmaz)
   .\guncelle.ps1 -Surum v1.4.2            belirli bir sürüme geç (eski sürüme dönüş de böyle yapılır)
   .\guncelle.ps1 -IlkKurulum              ilk sürümü oluşturur (servis henüz yok; servis-kur.ps1 sonra çalışır)
   .\guncelle.ps1 -YerelPaket C:\x\klinik-v1.zip   GitHub'a gitmeden elle indirilmiş paketi kullan (yanında .sha256 dosyası şart); ilk kurulum/prova için
   .\guncelle.ps1 -Zorla                   aynı sürümü yeniden dağıt
   .\guncelle.ps1 -GorevKaydet -GorevSaati 04:00 -GorevHesabi <hesap>   Task Scheduler görevi kaydeder (günlük)
 Çalıştıran hesap: yönetici hakkı olan deploy hesabı (servis yeniden başlatma, junction). deploy.env'i yalnız yöneticiler/SYSTEM okur.
 DENENMEDİ (Windows Server'da çalıştırılmadı).
#>
param(
  [string]$KokDizin = "C:\klinik",
  [string]$Surum = "",
  [string]$YerelPaket = "",
  [int]$Port = 3000,
  [int]$DenemePort = 3999,
  [int]$SonSurumSayisi = 5,
  [switch]$IlkKurulum,
  [switch]$Zorla,
  [switch]$GorevKaydet,
  [string]$GorevSaati = "04:00",
  [string]$GorevHesabi = ""
)
. "$PSScriptRoot\ortak.ps1"
YoneticiIste

if ($GorevKaydet) {
  if (-not $GorevHesabi) { throw "-GorevHesabi gerekli (yonetici hakki olan hesap)." }
  $parola = Read-Host -AsSecureString "'$GorevHesabi' parolasi"
  $duz = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($parola))
  # Görev, çalışan sürümün KENDİ betiğini çalıştırır (guncel junction'ı üzerinden).
  $eylem = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$KokDizin\guncel\deploy\windows\guncelle.ps1`" -KokDizin `"$KokDizin`""
  $tetik = New-ScheduledTaskTrigger -Daily -At $GorevSaati
  $ayar = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable
  try {
    Register-ScheduledTask -TaskName "Klinik-Guncelle" -Action $eylem -Trigger $tetik -Settings $ayar -User $GorevHesabi -Password $duz -RunLevel Highest -Force | Out-Null
  } finally { $duz = $null }
  Yazdir "Gorev kaydedildi: Klinik-Guncelle (her gun $GorevSaati). Yeni surum yoksa betik hicbir sey yapmaz."
  exit 0
}

$surumler = Join-Path $KokDizin "surumler"
$guncel = Join-Path $KokDizin "guncel"
$indirme = Join-Path $KokDizin "indirme"
$log = Join-Path $KokDizin "log"
$envDosyasi = Join-Path $KokDizin "gizli\uygulama.env"
$deployEnv = Join-Path $KokDizin "gizli\deploy.env"
$servis = "klinik-uygulama"
$saglik = "http://127.0.0.1:$Port/api/saglik"

function OlayYaz([string]$Tip, [string]$Mesaj) {
  try { Write-EventLog -LogName Application -Source "KlinikGuncelle" -EntryType $Tip -EventId 3000 -Message $Mesaj } catch { }
}
function JunctionHedefi {
  if (-not (Test-Path $guncel)) { return $null }
  return [string]@((Get-Item $guncel).Target)[0]
}
function JunctionAyarla([string]$Hedef) {
  if (Test-Path $guncel) { & cmd.exe /c rmdir "`"$guncel`"" | Out-Null }   # yalnız bağlantıyı siler, hedefe dokunmaz
  New-Item -ItemType Junction -Path $guncel -Target $Hedef | Out-Null
}
function MevcutSurum {
  $d = Join-Path $guncel "SURUM.txt"
  if (Test-Path $d) { return (Get-Content $d -TotalCount 1).Trim() }
  return $null
}

$kilit = KilitAl (Join-Path $log "guncelle.kilit")
if ($null -eq $kilit) { Yazdir "Baska bir guncelleme calisiyor; cikiliyor."; exit 0 }
Start-Transcript -Path (Join-Path $log ("guncelle-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))) | Out-Null

$onceki = $null; $yeniSurum = $null; $aktarilan = $null; $asama = "baslangic"; $guncelDegisti = $false
$env:PGPASSWORD = $null; Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

try {
  New-Item -ItemType Directory -Force -Path $indirme, $surumler | Out-Null
  $zip = $null; $sha = $null; $etiket = $null

  if ($YerelPaket) {
    # --- Elle indirilmiş paket (ilk kurulum / prova): GitHub'a gidilmez; yanındaki .sha256 ZORUNLU ---
    $asama = "yerel-paket"
    if (-not (Test-Path $YerelPaket) -or -not (Test-Path "$YerelPaket.sha256")) { throw "Yerel paket ve yanindaki .sha256 dosyasi gerekli." }
    $zip = Join-Path $indirme (Split-Path $YerelPaket -Leaf); Copy-Item $YerelPaket $zip -Force
    $sha = Join-Path $indirme ((Split-Path $YerelPaket -Leaf) + ".sha256"); Copy-Item "$YerelPaket.sha256" $sha -Force
    $etiket = if ($zip -match 'klinik-(.+)\.zip$') { $Matches[1] } else { "yerel" }
  } else {
    # --- GitHub sürüm eki: salt-okunur jeton ile ---
    $asama = "surum-sorgu"
    $e = EnvOku $deployEnv
    foreach ($k in "GITHUB_REPO", "GITHUB_DEPLOY_TOKEN") { if (-not $e.ContainsKey($k) -or -not $e[$k]) { throw "$k deploy.env icinde tanimli degil" } }
    if ($e["GITHUB_REPO"] -notmatch '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$') { throw "GITHUB_REPO 'sahip/depo' bicimde olmali" }
    $jeton = $e["GITHUB_DEPLOY_TOKEN"]
    $adres = if ($Surum) { "https://api.github.com/repos/$($e['GITHUB_REPO'])/releases/tags/$Surum" } else { "https://api.github.com/repos/$($e['GITHUB_REPO'])/releases/latest" }
    $surumBilgisi = (GitHubGetir $adres $jeton "application/vnd.github+json") | ConvertFrom-Json
    $etiket = [string]$surumBilgisi.tag_name
    if ($etiket -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw "Surum etiketi gecersiz" }
    $mevcut = MevcutSurum
    if (-not $Zorla -and -not $IlkKurulum -and -not $Surum -and $mevcut -eq $etiket) { Yazdir "Yeni surum yok (calisan: $mevcut); yapilacak is yok."; exit 0 }
    if ($Surum -and -not $Zorla -and $mevcut -eq $etiket) { Yazdir "$etiket zaten calisiyor."; exit 0 }
    Yazdir "Hedef surum: $etiket (calisan: $(if ($mevcut) { $mevcut } else { 'yok' }))"

    $asama = "indirme"
    $zipEk = $surumBilgisi.assets | Where-Object { $_.name -eq "klinik-$etiket.zip" } | Select-Object -First 1
    $shaEk = $surumBilgisi.assets | Where-Object { $_.name -eq "klinik-$etiket.zip.sha256" } | Select-Object -First 1
    if (-not $zipEk -or -not $shaEk) { throw "Surum '$etiket' icinde klinik-$etiket.zip ve .sha256 ekleri yok." }
    $zip = Join-Path $indirme $zipEk.name; $sha = Join-Path $indirme $shaEk.name
    GitHubGetir $shaEk.url $jeton "application/octet-stream" $sha
    GitHubGetir $zipEk.url $jeton "application/octet-stream" $zip
    if ((Get-Item $zip).Length -ne [int64]$zipEk.size) { throw "Indirilen dosya boyutu beklenenle uyusmuyor." }
  }

  # --- SHA256 doğrulama (bozuk/eksik indirme ya da değiştirilmiş dosya → durdur) ---
  $asama = "dogrulama"
  $beklenen = ((Get-Content $sha -TotalCount 1).Trim() -split "\s+")[0].ToLower()
  if ($beklenen -notmatch '^[0-9a-f]{64}$') { throw ".sha256 dosyasi gecersiz" }
  $gercek = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
  if ($gercek -ne $beklenen) { throw "SHA256 UYUSMUYOR (beklenen $($beklenen.Substring(0,12))..., gercek $($gercek.Substring(0,12))...). Paket KULLANILMADI." }
  Yazdir "SHA256 dogrulandi."

  # --- Ayrı klasöre aç ve paketi denetle ---
  $asama = "acma"
  $yeniSurum = Join-Path $surumler ("{0}-{1}" -f $etiket, (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $yeniSurum | Out-Null
  Calistir "tar.exe" @("-xf", $zip, "-C", $yeniSurum) "tar (paket acma)"
  foreach ($gerekli in "server.js", "SURUM.txt", "db\migrations", "db\kontrol", "deploy\windows\guncelle.ps1", ".next\static") {
    if (-not (Test-Path (Join-Path $yeniSurum $gerekli))) { throw "Paket eksik: $gerekli" }
  }
  if ((Get-Content (Join-Path $yeniSurum "SURUM.txt") -TotalCount 1).Trim() -ne $etiket) { throw "SURUM.txt etiketi ($etiket) ile uyusmuyor." }
  if (Get-ChildItem $yeniSurum -Recurse -Force -Include ".env*", "*.pem", "deploy.env" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "node_modules" }) { throw "Pakette gizli dosya benzeri dosya var; durduruldu." }
  Remove-Item $zip, $sha -Force -ErrorAction SilentlyContinue

  # --- Ön uçuş: yeni paket canlıya DOKUNMADAN ayrı portta açılıp /api/saglik doğrulanır ---
  if (Test-Path $envDosyasi) {
    $asama = "on-ucus"
    $eskiPort = $env:PORT; $eskiHost = $env:HOSTNAME; $eskiEnv = $env:NODE_ENV
    $env:PORT = "$DenemePort"; $env:HOSTNAME = "127.0.0.1"; $env:NODE_ENV = "production"
    $deneme = Start-Process -FilePath (Get-Command node).Source -ArgumentList "--env-file=`"$envDosyasi`"", "server.js" -WorkingDirectory $yeniSurum -PassThru -WindowStyle Hidden
    try {
      $env:PORT = $eskiPort; $env:HOSTNAME = $eskiHost; $env:NODE_ENV = $eskiEnv
      if (-not (SaglikBekle "http://127.0.0.1:$DenemePort/api/saglik" 60)) { throw "Yeni surum on ucusta acilmadi/sagliksiz (port $DenemePort)." }
    } finally { Stop-Process -Id $deneme.Id -Force -ErrorAction SilentlyContinue }
    Yazdir "On ucus tamam."
  }

  # --- Migration (yeni paketin kendi betiği ve SQL'leriyle; klinik_migrasyon rolü) ---
  $asama = "migrasyon"
  & "$yeniSurum\deploy\windows\migrasyon-uygula.ps1" -KokDizin $yeniSurum -GizliKlasor (Join-Path $KokDizin "gizli") -Kontrol
  if ($LASTEXITCODE -eq 10) {
    Yazdir "Bekleyen migration var → guncelleme oncesi yedek aliniyor."
    & "$yeniSurum\deploy\windows\yedek.ps1" -KokDizin $KokDizin -Etiket "guncelleme-oncesi"
    if ($LASTEXITCODE -ne 0) { throw "Guncelleme oncesi yedek alinamadi; migration UYGULANMADI." }
    & "$yeniSurum\deploy\windows\migrasyon-uygula.ps1" -KokDizin $yeniSurum -GizliKlasor (Join-Path $KokDizin "gizli")
    if ($LASTEXITCODE -ne 0) { throw "Migration basarisiz (dosya basina atomik; canli surum DEGISMEDI)." }
  } elseif ($LASTEXITCODE -ne 0) { throw "Migration kontrolu basarisiz (cikis $LASTEXITCODE)." }

  # --- Geçiş ---
  $asama = "gecis"
  $onceki = JunctionHedefi
  $guncelDegisti = $true
  JunctionAyarla $yeniSurum
  if ($IlkKurulum) { Yazdir "Ilk surum hazir: $yeniSurum. Siradaki: servis-kur.ps1"; OlayYaz "Information" "Ilk kurulum surumu: $etiket"; exit 0 }
  Restart-Service $servis
  if (-not (SaglikBekle $saglik 90)) { throw "Yeni surum saglik kontrolunden gecmedi ($saglik)." }

  Yazdir "Guncelleme basarili: $etiket ($yeniSurum)"
  OlayYaz "Information" "Guncelleme basarili: $etiket"
  # Eski sürümleri temizle: en yeni N + çalışan + bir önceki kalsın.
  $koru = @($yeniSurum, $onceki) | Where-Object { $_ }
  Get-ChildItem $surumler -Directory | Sort-Object LastWriteTime -Descending | Select-Object -Skip $SonSurumSayisi |
    Where-Object { $koru -notcontains $_.FullName } | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  exit 0
}
catch {
  $hata = $_.Exception.Message
  Yazdir "HATA ($asama): $hata"
  $cikis = 1
  if ($guncelDegisti -and $onceki) {
    Yazdir "Onceki surume donuluyor: $onceki"
    try {
      JunctionAyarla $onceki
      Restart-Service $servis
      if (SaglikBekle $saglik 90) { Yazdir "Geri donus basarili." } else { Yazdir "GERI DONUS SAGLIKSIZ — elle mudahale edin."; $cikis = 2 }
    } catch { Yazdir "Geri donus BASARISIZ: $($_.Exception.Message)"; $cikis = 2 }
  }
  if ($yeniSurum -and (Test-Path $yeniSurum) -and $cikis -eq 1) { Remove-Item $yeniSurum -Recurse -Force -ErrorAction SilentlyContinue }
  OlayYaz "Error" "Guncelleme basarisiz ($asama): $hata. Cikis kodu $cikis."
  exit $cikis
}
finally {
  try { Stop-Transcript | Out-Null } catch { }
  if ($kilit) { $kilit.Dispose() }
}

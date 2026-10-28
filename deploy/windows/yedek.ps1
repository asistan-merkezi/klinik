<#
 Günlük yedek (Task Scheduler, svc-klinik-yedek hesabı): pg_dump (klinik_yedek rolü) + dosya arşivi (DOSYA_KOKU) → age ile ŞİFRELE → özet → saklama → ayrı diske kopya.
 Tasarım: docs/sunucu-kurulum.md §4. Şifreleme anahtarı sunucuda DEĞİL: yalnız age ORTAK anahtarı (YEDEK_ALICI_ANAHTARI) burada; özel anahtar kasada.
 Sapma notu: dump önce yedek klasöründeki kısıtlı .gecici dizinine yazılır (PowerShell 5.1 boru hattı ikili veriyi bozar; cmd boru hattı da pg_dump
   hata kodunu gizler). Dump pg_restore -l ile doğrulanır, şifrelenir ve düz dosya HEMEN silinir (finally). .gecici yalnız yedek hesabına açık.
 Kullanım:  .\yedek.ps1                       günlük
            .\yedek.ps1 -Etiket guncelleme-oncesi   (guncelle.ps1 çağırır; saklama temizliğine tabi değil, ayrı adlandırılır)
 Çıkış kodu: 0 başarılı, 1 hata (olay günlüğüne "KlinikYedek" kaynağıyla yazılır; mesajda veri/parola yok).
 env: <Kok>\gizli\yedek.env — YEDEK_DATABASE_URL, YEDEK_HEDEF_KLASOR, YEDEK_ALICI_ANAHTARI, YEDEK_GUNLUK_SAKLAMA_GUN, YEDEK_AYLIK_SAKLAMA_AY,
        YEDEK_DIS_KOPYA_HEDEFI, DOSYA_KOKU (dosya arşivi için; yoksa yalnız veritabanı).
 DENENMEDİ (Windows Server'da çalıştırılmadı).
#>
param(
  [string]$KokDizin = "C:\klinik",
  [string]$EnvDosyasi = "",
  [string]$Etiket = "gunluk"
)
. "$PSScriptRoot\ortak.ps1"
if (-not $EnvDosyasi) { $EnvDosyasi = Join-Path $KokDizin "gizli\yedek.env" }

function OlayYaz([string]$Tip, [string]$Mesaj) {
  try { Write-EventLog -LogName Application -Source "KlinikYedek" -EntryType $Tip -EventId 4000 -Message $Mesaj } catch { }
}

$gecici = $null
try {
  $e = EnvOku $EnvDosyasi
  foreach ($k in "YEDEK_DATABASE_URL", "YEDEK_HEDEF_KLASOR", "YEDEK_ALICI_ANAHTARI") { if (-not $e.ContainsKey($k) -or -not $e[$k]) { throw "$k yedek.env içinde tanımlı değil" } }
  $hedef = $e["YEDEK_HEDEF_KLASOR"]
  $gunSaklama = if ($e.ContainsKey("YEDEK_GUNLUK_SAKLAMA_GUN")) { [int]$e["YEDEK_GUNLUK_SAKLAMA_GUN"] } else { 30 }
  $aySaklama = if ($e.ContainsKey("YEDEK_AYLIK_SAKLAMA_AY")) { [int]$e["YEDEK_AYLIK_SAKLAMA_AY"] } else { 12 }
  New-Item -ItemType Directory -Force -Path $hedef | Out-Null
  $gecici = Join-Path $hedef ".gecici"
  New-Item -ItemType Directory -Force -Path $gecici | Out-Null

  # Bağlantı: URL'yi PG* ortam değişkenlerine aç (parola komut satırında görünmesin).
  $u = [uri]$e["YEDEK_DATABASE_URL"]
  $kim = $u.UserInfo.Split(":", 2)
  $env:PGHOST = $u.Host; $env:PGPORT = "$(if ($u.Port -gt 0) { $u.Port } else { 5432 })"
  $env:PGUSER = [uri]::UnescapeDataString($kim[0]); $env:PGPASSWORD = [uri]::UnescapeDataString($kim[1])
  $env:PGDATABASE = $u.AbsolutePath.TrimStart("/")
  if ($u.Host -notin "localhost", "127.0.0.1", "::1") { throw "Yedek bağlantısı yalnız localhost olabilir." }

  $simdi = Get-Date
  $ad = "{0}-{1}" -f $simdi.ToString("yyyy-MM-dd-HHmm"), $Etiket
  $dumpDuz = Join-Path $gecici "$ad.dump"
  $dbSifreli = Join-Path $hedef "$ad.dump.age"

  # 1) Veritabanı dökümü + bütünlük (içindekiler listesi okunabiliyor mu)
  Calistir "pg_dump" @("-Fc", "--no-password", "-f", $dumpDuz) "pg_dump"
  Calistir "pg_restore" @("-l", $dumpDuz) "pg_restore -l (dump doğrulama)" | Out-Null
  if ((Get-Item $dumpDuz).Length -lt 1024) { throw "Dump beklenenden küçük" }

  # 2) Şifrele (yalnız ortak anahtar) ve düz dosyayı sil
  Calistir "age" @("-r", $e["YEDEK_ALICI_ANAHTARI"], "-o", $dbSifreli, $dumpDuz) "age (veritabanı)"
  Remove-Item $dumpDuz -Force
  if ((Get-Item $dbSifreli).Length -eq 0) { throw "Şifreli yedek boş" }
  $h = (Get-FileHash -Algorithm SHA256 -Path $dbSifreli).Hash.ToLower()
  "$h  $(Split-Path $dbSifreli -Leaf)" | Set-Content -Path "$dbSifreli.sha256" -Encoding ASCII

  # 3) Dosya arşivi (hasta belgeleri, logolar): tar → age. DOSYA_KOKU yoksa atlanır.
  if ($e.ContainsKey("DOSYA_KOKU") -and (Test-Path $e["DOSYA_KOKU"])) {
    $tarDuz = Join-Path $gecici "$ad.dosya.tar"
    $dosyaSifreli = Join-Path $hedef "$ad.dosya.tar.age"
    Calistir "tar.exe" @("-cf", $tarDuz, "-C", $e["DOSYA_KOKU"], ".") "tar (dosya arşivi)"
    Calistir "age" @("-r", $e["YEDEK_ALICI_ANAHTARI"], "-o", $dosyaSifreli, $tarDuz) "age (dosya arşivi)"
    Remove-Item $tarDuz -Force
    $h2 = (Get-FileHash -Algorithm SHA256 -Path $dosyaSifreli).Hash.ToLower()
    "$h2  $(Split-Path $dosyaSifreli -Leaf)" | Set-Content -Path "$dosyaSifreli.sha256" -Encoding ASCII
  }

  # 4) Aylık: ayın ilk günlük yedeği aylık olarak da saklanır (günlük temizliğinden korunur)
  if ($Etiket -eq "gunluk") {
    $ay = $simdi.ToString("yyyy-MM")
    if (-not (Get-ChildItem $hedef -Filter "$ay-aylik.dump.age" -ErrorAction SilentlyContinue)) {
      foreach ($son in ".dump.age", ".dosya.tar.age") {
        $kaynakDosya = Join-Path $hedef "$ad$son"
        if (Test-Path $kaynakDosya) {
          $yeniAd = "$ay-aylik$son"
          Copy-Item $kaynakDosya (Join-Path $hedef $yeniAd)
          "$((Get-FileHash -Algorithm SHA256 -Path (Join-Path $hedef $yeniAd)).Hash.ToLower())  $yeniAd" | Set-Content -Path (Join-Path $hedef "$yeniAd.sha256") -Encoding ASCII
        }
      }
    }
  }

  # 5) Saklama: günlükler N günden, aylıklar M aydan eskiyse silinir. "guncelleme-oncesi" yedekleri 30 gün sonra silinir.
  function Temizle([string]$Klasor) {
    if (-not (Test-Path $Klasor)) { return }
    foreach ($d in Get-ChildItem $Klasor -File) {
      if ($d.Name -match '^(\d{4}-\d{2}-\d{2})-\d{4}-gunluk\.') { if ([datetime]::ParseExact($Matches[1], "yyyy-MM-dd", $null) -lt $simdi.Date.AddDays(-$gunSaklama)) { Remove-Item $d.FullName -Force } }
      elseif ($d.Name -match '^(\d{4}-\d{2})-aylik\.') { if ([datetime]::ParseExact($Matches[1] + "-01", "yyyy-MM-dd", $null) -lt $simdi.Date.AddMonths(-$aySaklama)) { Remove-Item $d.FullName -Force } }
      elseif ($d.Name -match '^(\d{4}-\d{2}-\d{2})-\d{4}-guncelleme-oncesi\.') { if ([datetime]::ParseExact($Matches[1], "yyyy-MM-dd", $null) -lt $simdi.Date.AddDays(-30)) { Remove-Item $d.FullName -Force } }
    }
  }
  Temizle $hedef

  # 6) Ayrı diske/paylaşıma kopya (sunucudan dışarı doğru). Hedef yoksa uyarı: yedek tek diskte DEĞİL sayılamaz.
  if ($e.ContainsKey("YEDEK_DIS_KOPYA_HEDEFI") -and $e["YEDEK_DIS_KOPYA_HEDEFI"]) {
    $dis = $e["YEDEK_DIS_KOPYA_HEDEFI"]
    New-Item -ItemType Directory -Force -Path $dis | Out-Null
    & robocopy $hedef $dis "*.age" "*.sha256" /XO /R:2 /W:5 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Dış kopya başarısız (robocopy $LASTEXITCODE)" }
    $global:LASTEXITCODE = 0
    Temizle $dis
  } else { OlayYaz "Warning" "YEDEK_DIS_KOPYA_HEDEFI tanımlı değil: yedek yalnız aynı sunucuda." }

  Yazdir "Yedek tamam: $ad"
  OlayYaz "Information" "Yedek tamam: $ad"
  exit 0
}
catch {
  Yazdir "YEDEK HATASI: $($_.Exception.Message)"
  OlayYaz "Error" "Yedek başarısız: $($_.Exception.Message)"
  exit 1
}
finally {
  if ($gecici -and (Test-Path $gecici)) { Get-ChildItem $gecici -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

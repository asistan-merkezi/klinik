<#
 Sürüm paketini minisign ile İMZALAR ve yayınlar. YALNIZ GELİŞTİRİCİNİN BİLGİSAYARINDA çalışır.
 ÖZEL ANAHTAR (minisign .key) yalnız geliştiricinin bilgisayarında (parola korumalı) durur; depoya, CI'a, sunucuya ASLA girmez.
 Bu betik anahtarın bir git deposunun içinde olmasını reddeder; .gitignore *.key dosyalarını dışarıda bırakır.

 Akış (CI sürümü TASLAK olarak açar: derle.yml `gh release create --draft`; sunucular taslağı "latest" olarak GÖRMEZ):
   1. Taslak sürümden klinik-<etiket>.zip + .sha256 indirilir (gh).
   2. SHA256 yeniden hesaplanıp .sha256 ile karşılaştırılır; özet ekrana yazılır → GitHub Actions çalışmasının "Özet" sayfasındaki SHA256 ile
      karşılaştırıp onaylamanız istenir (derleme çıktısının CI'dan geldiğini siz doğrularsınız).
   3. minisign ile imzalanır; imzalı (trusted) yorum "klinik-<etiket>" olur (guncelle.ps1 bunu denetler: eski sürümün imzası yeni sürüm gibi sunulamaz).
   4. Üretilen imza AÇIK ANAHTARLA doğrulanır, sonra klinik-<etiket>.zip.minisig sürüme yüklenir.
   5. -Yayinla ile taslak yayınlanır (artık sunucular indirebilir). -Yayinla'sız bırakırsanız sürüm taslak kalır (elle gözden geçirin).
 Önkoşul: gh (oturum açık), minisign. Anahtar üretimi (bir kez): minisign -G -p <klasor>\klinik.pub -s <klasor>\klinik.key
 Kullanım:  .\scripts\yayin-imzala.ps1 -Etiket v1.4.2 -Yayinla
 Anahtar rotasyonu / açık anahtarın sunucuya yerleşimi: docs/sunucu-kurulum.md §10d.
 DENENMEDİ (gerçek bir sürümle çalıştırılmadı; minisign çıktı biçimi ve `gh release download` taslak davranışı ilk yayında doğrulanacak).
#>
param(
  [Parameter(Mandatory)][string]$Etiket,
  [string]$Depo = "",
  [string]$AnahtarDosyasi = (Join-Path $env:USERPROFILE ".minisign\klinik.key"),
  [string]$AcikAnahtar = (Join-Path $env:USERPROFILE ".minisign\klinik.pub"),
  [switch]$Yayinla
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($Etiket -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw "Etiket gecersiz: $Etiket" }
foreach ($k in "gh", "minisign") { if (-not (Get-Command $k -ErrorAction SilentlyContinue)) { throw "$k bulunamadi." } }
foreach ($d in $AnahtarDosyasi, $AcikAnahtar) { if (-not (Test-Path $d)) { throw "Dosya yok: $d" } }

# Özel anahtar bir git deposunun içinde OLAMAZ (yanlışlıkla commit'lenmesin).
$dizin = Split-Path -Parent (Resolve-Path $AnahtarDosyasi).Path
for ($yol = $dizin; $yol; $yol = Split-Path -Parent $yol) {
  if (Test-Path (Join-Path $yol ".git")) { throw "Ozel anahtar bir git deposunun icinde ($yol). Kullanici profilinize tasiyin: $env:USERPROFILE\.minisign" }
}
if (-not $Depo) { $Depo = (& gh repo view --json nameWithOwner --jq .nameWithOwner).Trim() }

$gecici = Join-Path $env:TEMP ("klinik-imza-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $gecici | Out-Null
try {
  $zip = Join-Path $gecici "klinik-$Etiket.zip"
  & gh release download $Etiket --repo $Depo --pattern "klinik-$Etiket.zip" --pattern "klinik-$Etiket.zip.sha256" --dir $gecici
  if ($LASTEXITCODE -ne 0) { throw "Surum ekleri indirilemedi (gh release download)." }

  $beklenen = ((Get-Content "$zip.sha256" -TotalCount 1) -split "\s+")[0].ToLower()
  $gercek = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
  if ($gercek -ne $beklenen) { throw "SHA256 uyusmuyor (indirilen $gercek, .sha256 $beklenen)." }
  Write-Host "Paket SHA256: $gercek"
  $onay = Read-Host "Bu ozet GitHub Actions calismasindaki (Summary) SHA256 ile AYNI mi? (evet/hayir)"
  if ($onay -ne "evet") { throw "Onaylanmadi; imzalanmadi." }

  $imza = "$zip.minisig"
  # Parola istemi minisign'dan gelir (özel anahtar parola korumalıdır).
  & minisign -S -s $AnahtarDosyasi -m $zip -x $imza -t "klinik-$Etiket"
  if ($LASTEXITCODE -ne 0) { throw "Imzalama basarisiz." }
  & minisign -V -m $zip -p $AcikAnahtar -x $imza
  if ($LASTEXITCODE -ne 0) { throw "Uretilen imza ACIK ANAHTARLA dogrulanamadi (yanlis anahtar cifti?)." }

  & gh release upload $Etiket $imza --repo $Depo --clobber
  if ($LASTEXITCODE -ne 0) { throw "Imza eki yuklenemedi." }
  Write-Host "Imza yuklendi: klinik-$Etiket.zip.minisig"
  if ($Yayinla) {
    & gh release edit $Etiket --repo $Depo --draft=false --latest
    if ($LASTEXITCODE -ne 0) { throw "Surum yayinlanamadi." }
    Write-Host "Surum YAYINLANDI: $Etiket"
  } else { Write-Host "Surum TASLAK kaldi. Yayinlamak icin: gh release edit $Etiket --repo $Depo --draft=false --latest" }
}
finally { Remove-Item $gecici -Recurse -Force -ErrorAction SilentlyContinue }

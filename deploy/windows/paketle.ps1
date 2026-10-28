<#
 Sürüm paketini üretir (CI'da .github/workflows/derle.yml çağırır; elle de çalışır). `next build` (output: standalone) ÇIKTISI hazır olmalı.
 Paket içeriği (zip kökü = çalışma dizini):  standalone çıktısı (server.js, node_modules, .next) + .next\static + public
   + db\migrations + db\kontrol + db\kurulum + db\seed + deploy\windows + bakim\*.mjs + scripts\db-kur.ps1 + scripts\gorevleri-kur.ps1 + SURUM.txt (1. satır sürüm etiketi, 2. satır commit, 3. satır tarih).
 Çıktı:  <Cikis>\klinik-<Surum>.zip  ve  klinik-<Surum>.zip.sha256  ("<sha256>  <dosya adı>").
 Güvenlik: pakette .env*, *.pem, deploy.env benzeri dosya OLAMAZ (varsa betik başarısız olur); sunucuda derleme/npm yoktur, paket DEĞİŞMEDEN çalışır.
 Kullanım:  .\deploy\windows\paketle.ps1 -Surum v1.0.0 -Commit <sha> -Cikis dist
#>
param(
  [Parameter(Mandatory)][string]$Surum,
  [string]$Commit = "bilinmiyor",
  [string]$Cikis = "dist",
  [string]$Kok = ""
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if (-not $Kok) { $Kok = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
if ($Surum -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw "Surum etiketi gecersiz: $Surum" }
Set-Location $Kok
if (-not (Test-Path ".next\standalone\server.js")) { throw ".next\standalone\server.js yok: once 'npm run build' (output: standalone)." }

$paket = Join-Path $Cikis "paket"
if (Test-Path $paket) { Remove-Item $paket -Recurse -Force }
New-Item -ItemType Directory -Force -Path $paket | Out-Null

function Kopyala([string]$Kaynak, [string]$Hedef) {
  if (-not (Test-Path $Kaynak)) { throw "Kaynak yok: $Kaynak" }
  & robocopy $Kaynak $Hedef /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy basarisiz: $Kaynak" }
  $global:LASTEXITCODE = 0
}
Kopyala ".next\standalone" $paket
Kopyala ".next\static" (Join-Path $paket ".next\static")
if (Test-Path "public") { Kopyala "public" (Join-Path $paket "public") }
foreach ($d in "db\migrations", "db\kontrol", "db\kurulum", "db\seed") {
  if (Test-Path (Join-Path $paket $d)) { throw "Standalone ciktisinda beklenmeyen cakisma: $d" }
  Kopyala $d (Join-Path $paket $d)
}
Kopyala "deploy\windows" (Join-Path $paket "deploy\windows")
# Bakim betikleri (Task Scheduler): `npm run bakim:derle` ciktisi (tek dosyalik .mjs, node ile calisir). scripts\windows\gorevleri-kur.ps1 de pakete girer.
if (-not (Test-Path "bakim-dist\audit-log-bolum-olustur.mjs")) { throw "bakim-dist yok: once 'npm run bakim:derle'." }
Kopyala "bakim-dist" (Join-Path $paket "bakim")
New-Item -ItemType Directory -Force -Path (Join-Path $paket "scripts") | Out-Null
Copy-Item "scripts\db-kur.ps1" (Join-Path $paket "scripts\db-kur.ps1")
Copy-Item "scripts\windows\gorevleri-kur.ps1" (Join-Path $paket "scripts\gorevleri-kur.ps1")
@($Surum, $Commit, (Get-Date -Format "yyyy-MM-ddTHH:mm:ssK")) | Set-Content -Path (Join-Path $paket "SURUM.txt") -Encoding ASCII

# Gizli dosya denetimi (node_modules içindeki üçüncü taraf örnek dosyaları hariç)
$sizinti = Get-ChildItem $paket -Recurse -Force -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\node_modules\\" -and ($_.Name -like ".env*" -or $_.Name -like "*.pem" -or $_.Name -eq "deploy.env" -or $_.Name -like "*.key") }
if ($sizinti) { throw ("Pakette gizli dosya benzeri dosya var: " + (($sizinti | ForEach-Object FullName) -join ", ")) }

New-Item -ItemType Directory -Force -Path $Cikis | Out-Null
$zip = Join-Path $Cikis "klinik-$Surum.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
& tar.exe -a -c -f $zip -C $paket .
if ($LASTEXITCODE -ne 0) { throw "tar (zip) basarisiz" }
$h = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
"$h  klinik-$Surum.zip" | Set-Content -Path "$zip.sha256" -Encoding ASCII
Remove-Item $paket -Recurse -Force
Write-Host "Paket: $zip  ($([math]::Round((Get-Item $zip).Length / 1MB, 1)) MB)"
Write-Host "SHA256: $h"

<#
 Boş Postgres'e klinik veritabanını kurar (Aşama 2). psql.exe PATH'te olmalı.
 Şifreler dosyaya YAZILMAZ: ortam değişkeninden okunur (KLINIK_UYGULAMA_SIFRE, KLINIK_BAKIM_SIFRE, KLINIK_YEDEK_SIFRE);
 süper kullanıcı bağlantısı PGPASSWORD veya pgpass ile verilir.
 DENENMEDİ: Windows'ta psql ile çalıştırılmadı; aynı SQL dosyaları bir Node düzeneğiyle denendi.
 Kullanım:  .\scripts\db-kur.ps1 -Sunucu localhost -Port 5432 -SuperKullanici postgres
#>
param(
  [string]$Sunucu = "localhost",
  [int]$Port = 5432,
  [string]$SuperKullanici = "postgres"
)
$ErrorActionPreference = "Stop"
foreach ($d in "KLINIK_UYGULAMA_SIFRE", "KLINIK_BAKIM_SIFRE", "KLINIK_YEDEK_SIFRE") {
  if (-not (Get-Item "env:$d" -ErrorAction SilentlyContinue)) { throw "$d ortam değişkeni gerekli" }
}
$kok = Split-Path -Parent $PSScriptRoot
$baglanti = @("-h", $Sunucu, "-p", $Port, "-U", $SuperKullanici, "-v", "ON_ERROR_STOP=1", "-X", "-q")

function Psql([string]$Veritabani, [string]$Dosya, [string[]]$Ek = @()) {
  Write-Host ">> $Dosya ($Veritabani)"
  & psql @baglanti -d $Veritabani @Ek -f (Join-Path $kok $Dosya)
  if ($LASTEXITCODE -ne 0) { throw "psql başarısız: $Dosya" }
}

# 1) Roller ve veritabanı (süper kullanıcı)
Psql "postgres" "db/kurulum/00_roller.sql" @(
  "-v", "uygulama_sifre=$env:KLINIK_UYGULAMA_SIFRE",
  "-v", "bakim_sifre=$env:KLINIK_BAKIM_SIFRE",
  "-v", "yedek_sifre=$env:KLINIK_YEDEK_SIFRE")
Psql "postgres" "db/kurulum/01_veritabani.sql"
Psql "klinik" "db/kurulum/02_eklentiler.sql"

# 2) Şema ve tohum: nesne sahibi klinik_sahip (SET ROLE ile)
foreach ($f in "db/migrations/0001_kimlik_ve_baglam.sql", "db/migrations/0002_temel_sema.sql",
               "db/migrations/0003_baglam_politikalari.sql", "db/seed/0001_referans_veri.sql") {
  $gecici = New-TemporaryFile
  try {
    "SET ROLE klinik_sahip;" | Set-Content -Path $gecici -Encoding utf8
    Get-Content (Join-Path $kok $f) -Raw -Encoding utf8 | Add-Content -Path $gecici -Encoding utf8
    Write-Host ">> $f"
    & psql @baglanti -d klinik -f $gecici
    if ($LASTEXITCODE -ne 0) { throw "psql başarısız: $f" }
  } finally { Remove-Item $gecici -Force -ErrorAction SilentlyContinue }
}

# 3) Aylık audit_log bölümleri (3 ay ileri)
& psql @baglanti -d klinik -c "SET ROLE klinik_sahip; SELECT audit_log_bolum_olustur(3);"
if ($LASTEXITCODE -ne 0) { throw "audit_log bölümleri açılamadı" }

# 4) RLS atlayan rol/fonksiyon denetimi (hata varsa kurulum başarısız sayılır)
Psql "klinik" "db/kontrol/bypassrls-kontrol.sql"
Write-Host "Kurulum tamam."

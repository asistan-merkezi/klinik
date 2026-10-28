<#
 db\migrations\*.sql dosyalarından henüz uygulanmamış olanları SIRAYLA uygular (guncelle.ps1 çağırır; elle de çalışır).
  - Bağlantı: klinik_migrasyon rolü. Adres/parola <gizli>\deploy.env > MIGRASYON_DATABASE_URL (ya da aynı adlı ortam değişkeni). SÜPER KULLANICI KULLANILMAZ.
    Rolün tek yetkisi klinik_sahip'e SET ROLE etmektir; tenant verisini kendi başına okuyamaz (db/kurulum/00_roller.sql).
  - Takip: migrasyon.kayit (dosya, sha256, uygulandi) — db/kurulum/03_migrasyon_kaydi.sql ilk kurulumda oluşturur. Her dosya TEK transaction'da (psql -1) çalışır
    ve kayıt satırı aynı transaction'da yazılır: dosya ya tamamen uygulanır ya hiç. (CREATE INDEX CONCURRENTLY gibi transaction'sız ifadeler bu betikle uygulanamaz.)
  - Uygulama sonrası bypassrls-kontrol.sql + yetki-matrisi.sql çalışır (klinik_sahip olarak); HATA varsa betik başarısız sayılır.
  - Migration'lar ROL / VERİTABANI / EKLENTİ OLUŞTURAMAZ (bunlar süper kullanıcı işidir ve kurulum betiklerindedir: db/kurulum/*). Böyle bir ihtiyaç doğarsa
    kurulum betiğine yeni numaralı dosya eklenir ve süper kullanıcıyla ELLE (tek seferlik) uygulanır; migration klasörüne konmaz.
 Geri alma YOKTUR (ileri yönlü). Migration kuralları (CLAUDE.md): geriye dönük uyumlu yaz (genişlet → taşı → daralt).
 Kullanım:
   .\migrasyon-uygula.ps1                   uygula
   .\migrasyon-uygula.ps1 -Kontrol          yalnız bekleyenleri listele; çıkış kodu 10 = bekleyen var, 0 = yok
   .\migrasyon-uygula.ps1 -KaydaIsle -SuperKullanici postgres   (YALNIZ db-kur.ps1 çağırır, kurulumda) mevcut tüm dosyaları "uygulandı" say
 DENENMEDİ (Windows Server'da psql ile çalıştırılmadı).
#>
param(
  [string]$KokDizin = "",
  [string]$GizliKlasor = "C:\klinik\gizli",
  [string]$SuperKullanici = "",     # yalnız -KaydaIsle (kurulum): PGPASSWORD/pgpass ile bağlanır
  [string]$Sunucu = "localhost",
  [int]$Port = 5432,
  [string]$Veritabani = "klinik",
  [switch]$Kontrol,
  [switch]$KaydaIsle
)
. "$PSScriptRoot\ortak.ps1"
if (-not $KokDizin) { $KokDizin = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }   # deploy\windows -> paket/depo kökü

if ($KaydaIsle) {
  if (-not $SuperKullanici) { throw "-KaydaIsle yalnizca kurulumda, -SuperKullanici ile kullanilir." }
  $baglanti = @("-h", $Sunucu, "-p", $Port, "-U", $SuperKullanici, "-d", $Veritabani, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-w")
} else {
  $url = $env:MIGRASYON_DATABASE_URL
  if (-not $url) { $url = (EnvOku (Join-Path $GizliKlasor "deploy.env"))["MIGRASYON_DATABASE_URL"] }
  if (-not $url) { throw "MIGRASYON_DATABASE_URL bulunamadi ($GizliKlasor\deploy.env)." }
  PgUrlAyarla $url
  $baglanti = @("-v", "ON_ERROR_STOP=1", "-X", "-q", "-w")
}
function Psql([string[]]$Arg) { & psql @baglanti @Arg; if ($LASTEXITCODE -ne 0) { throw "psql basarisiz" } }
function PsqlSahipOlarak([string]$Dosya, [string[]]$Ek = @()) {   # SET ROLE klinik_sahip + dosya içeriği (+ isteğe bağlı sonek) tek geçici dosyada
  $gecici = New-TemporaryFile
  try {
    $icerik = "SET ROLE klinik_sahip;`r`n" + (Get-Content $Dosya -Raw -Encoding UTF8) + "`r`n" + ($Ek -join "`r`n")
    [System.IO.File]::WriteAllText($gecici.FullName, $icerik, (New-Object System.Text.UTF8Encoding($false)))
    Psql @("-1", "-f", $gecici.FullName)
  } finally { Remove-Item $gecici.FullName -Force -ErrorAction SilentlyContinue }
}

try {
  $var = (& psql @baglanti -tA -c "SET ROLE klinik_sahip; SELECT to_regclass('migrasyon.kayit') IS NOT NULL" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "psql basarisiz (baglanti/parola?)" }
  if ($var -ne "t") { throw "migrasyon.kayit yok: db/kurulum/03_migrasyon_kaydi.sql (ilk kurulum) uygulanmamis." }

  $dosyalar = Get-ChildItem -Path (Join-Path $KokDizin "db\migrations") -Filter "*.sql" | Sort-Object Name
  $kayitlar = @{}
  foreach ($satir in (& psql @baglanti -tA -F "|" -c "SET ROLE klinik_sahip; SELECT dosya, sha256 FROM migrasyon.kayit")) { if ($satir -and $satir.Contains("|")) { $p = $satir.Split("|"); $kayitlar[$p[0]] = $p[1] } }

  if ($KaydaIsle) {
    if ($kayitlar.Count -gt 0) { throw "migrasyon.kayit bos degil; -KaydaIsle yalnizca ilk kurulumda, bir kez kullanilir." }
    foreach ($d in $dosyalar) {
      $h = (Get-FileHash -Algorithm SHA256 -Path $d.FullName).Hash.ToLower()
      Psql @("-c", "SET ROLE klinik_sahip; INSERT INTO migrasyon.kayit(dosya, sha256) VALUES ('$($d.Name)', '$h');")
    }
    Yazdir "$($dosyalar.Count) migration 'uygulandi' olarak kaydedildi."
    exit 0
  }

  $bekleyen = @()
  foreach ($d in $dosyalar) {
    $h = (Get-FileHash -Algorithm SHA256 -Path $d.FullName).Hash.ToLower()
    if (-not $kayitlar.ContainsKey($d.Name)) { $bekleyen += $d }
    elseif ($kayitlar[$d.Name] -ne $h) { Yazdir "UYARI: $($d.Name) uygulandiktan sonra DEGISTIRILMIS (ozet farkli). Uygulanmis migration duzenlenmez; yeni dosya yazin." }
  }
  if ($Kontrol) {
    if ($bekleyen.Count -eq 0) { Yazdir "Bekleyen migration yok."; exit 0 }
    Yazdir ("Bekleyen: " + (($bekleyen | ForEach-Object Name) -join ", "))
    exit 10
  }
  if ($bekleyen.Count -eq 0) { Yazdir "Bekleyen migration yok."; exit 0 }

  foreach ($d in $bekleyen) {
    $h = (Get-FileHash -Algorithm SHA256 -Path $d.FullName).Hash.ToLower()
    Yazdir ">> $($d.Name)"
    PsqlSahipOlarak $d.FullName @("INSERT INTO migrasyon.kayit(dosya, sha256) VALUES ('$($d.Name)', '$h');")
  }
  # Yetki/RLS denetimi: migration sonrası RLS atlayan rol/fonksiyon ve yetki ihlali kalmadığını doğrula (HATA → betik başarısız). Çıktıdaki tablolar gizlenir, hata görünür.
  foreach ($k in "bypassrls-kontrol.sql", "yetki-matrisi.sql") {
    $yol = Join-Path $KokDizin "db\kontrol\$k"
    $gecici = New-TemporaryFile
    try {
      [System.IO.File]::WriteAllText($gecici.FullName, "SET ROLE klinik_sahip;`r`n" + (Get-Content $yol -Raw -Encoding UTF8), (New-Object System.Text.UTF8Encoding($false)))
      & psql @baglanti -f $gecici.FullName | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "$k basarisiz (yetki ihlali)" }
    } finally { Remove-Item $gecici.FullName -Force -ErrorAction SilentlyContinue }
  }
  Yazdir "$($bekleyen.Count) migration uygulandi; yetki kontrolleri temiz."
}
finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }

<#
 db\migrations\*.sql dosyalarından henüz uygulanmamış olanları SIRAYLA uygular (guncelle.ps1 çağırır; elle de çalışır).
  - Takip: migrasyon.kayit (dosya, sha256, uygulandi). Her dosya TEK transaction'da (psql -1) çalışır ve kayıt satırı aynı transaction'da yazılır:
    dosya ya tamamen uygulanır ya hiç. (CREATE INDEX CONCURRENTLY gibi transaction'sız ifadeler bu betikle uygulanamaz; ayrı elle işlem.)
  - Nesne sahibi klinik_sahip: db-kur.ps1 ile aynı yöntem (süper kullanıcıyla bağlanıp SET ROLE klinik_sahip).
  - Süper kullanıcı parolası: PGPASSWORD veya bu betiği çalıştıran hesabın pgpass.conf dosyası. Betik parola SORMAZ/YAZMAZ.
 Geri alma YOKTUR (ileri yönlü). Geriye dönük uyumlu (genişlet → taşı → daralt) yazılmayan bir migration kod geri alınınca sorun çıkarır;
 gerekirse guncelle.ps1'in aldığı güncelleme öncesi yedekten dönülür (docs/sunucu-kurulum.md).
 Kullanım:
   .\migrasyon-uygula.ps1                   uygula
   .\migrasyon-uygula.ps1 -Kontrol          yalnız bekleyenleri listele; çıkış kodu 10 = bekleyen var, 0 = yok
   .\migrasyon-uygula.ps1 -KaydaIsle        (db-kur.ps1 ile kurulumdan hemen sonra, BİR KEZ) mevcut tüm dosyaları "uygulandı" say
 DENENMEDİ (Windows Server'da psql ile çalıştırılmadı).
#>
param(
  [string]$KokDizin = "",
  [string]$Sunucu = "localhost",
  [int]$Port = 5432,
  [string]$SuperKullanici = "postgres",
  [string]$Veritabani = "klinik",
  [switch]$Kontrol,
  [switch]$KaydaIsle
)
. "$PSScriptRoot\ortak.ps1"
if (-not $KokDizin) { $KokDizin = Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }   # deploy\windows -> depo kökü
$baglanti = @("-h", $Sunucu, "-p", $Port, "-U", $SuperKullanici, "-d", $Veritabani, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-w")
function Psql([string[]]$Arg) { & psql @baglanti @Arg; if ($LASTEXITCODE -ne 0) { throw "psql başarısız" } }
function PsqlDeger([string]$Sorgu) { $r = & psql @baglanti -tA -c $Sorgu; if ($LASTEXITCODE -ne 0) { throw "psql başarısız" }; return ($r | Out-String).Trim() }

# Takip tablosu: ayrı şema (public değil → tenant tablosu denetimleri ve uygulama rolleri bunu GÖRMEZ), sahibi klinik_sahip, kimseye yetki yok.
Psql @("-c", "CREATE SCHEMA IF NOT EXISTS migrasyon AUTHORIZATION klinik_sahip; REVOKE ALL ON SCHEMA migrasyon FROM PUBLIC;")
Psql @("-c", "SET ROLE klinik_sahip; CREATE TABLE IF NOT EXISTS migrasyon.kayit (dosya text PRIMARY KEY, sha256 text NOT NULL, uygulandi timestamptz NOT NULL DEFAULT now());")

$dosyalar = Get-ChildItem -Path (Join-Path $KokDizin "db\migrations") -Filter "*.sql" | Sort-Object Name
$kayitlar = @{}
foreach ($satir in (& psql @baglanti -tA -F "|" -c "SELECT dosya, sha256 FROM migrasyon.kayit")) { if ($satir) { $p = $satir.Split("|"); $kayitlar[$p[0]] = $p[1] } }
if ($LASTEXITCODE -ne 0) { throw "kayıt okunamadı" }

if ($KaydaIsle) {
  if ($kayitlar.Count -gt 0) { throw "migrasyon.kayit boş değil; -KaydaIsle yalnız ilk kurulumda, bir kez kullanılır." }
  foreach ($d in $dosyalar) {
    $h = (Get-FileHash -Algorithm SHA256 -Path $d.FullName).Hash.ToLower()
    Psql @("-c", "SET ROLE klinik_sahip; INSERT INTO migrasyon.kayit(dosya, sha256) VALUES ('$($d.Name)', '$h');")
  }
  Yazdir "$($dosyalar.Count) migration 'uygulandı' olarak kaydedildi."
  exit 0
}

$bekleyen = @()
foreach ($d in $dosyalar) {
  $h = (Get-FileHash -Algorithm SHA256 -Path $d.FullName).Hash.ToLower()
  if (-not $kayitlar.ContainsKey($d.Name)) { $bekleyen += $d }
  elseif ($kayitlar[$d.Name] -ne $h) { Yazdir "UYARI: $($d.Name) uygulandıktan sonra DEĞİŞTİRİLMİŞ (özet farklı). Uygulanmış migration düzenlenmez; yeni dosya yazın." }
}
if ($Kontrol) {
  if ($bekleyen.Count -eq 0) { Yazdir "Bekleyen migration yok."; exit 0 }
  Yazdir ("Bekleyen: " + (($bekleyen | ForEach-Object Name) -join ", "))
  exit 10
}
if ($bekleyen.Count -eq 0) { Yazdir "Bekleyen migration yok."; exit 0 }

foreach ($d in $bekleyen) {
  $h = (Get-FileHash -Algorithm SHA256 -Path $d.FullName).Hash.ToLower()
  $gecici = New-TemporaryFile
  try {
    $icerik = "SET ROLE klinik_sahip;`r`n" + (Get-Content $d.FullName -Raw -Encoding UTF8) + "`r`nINSERT INTO migrasyon.kayit(dosya, sha256) VALUES ('$($d.Name)', '$h');`r`n"
    [System.IO.File]::WriteAllText($gecici.FullName, $icerik, (New-Object System.Text.UTF8Encoding($false)))
    Yazdir ">> $($d.Name)"
    Psql @("-1", "-f", $gecici.FullName)
  } finally { Remove-Item $gecici.FullName -Force -ErrorAction SilentlyContinue }
}
# Yetki/RLS denetimi: migration sonrası RLS atlayan rol/fonksiyon kalmadığını doğrula (db-kur.ps1 ile aynı kontrol).
Psql @("-f", (Join-Path $KokDizin "db\kontrol\bypassrls-kontrol.sql"))
Yazdir "$($bekleyen.Count) migration uygulandı."

<#
 Ortak yardımcılar (diğer betikler `. "$PSScriptRoot\ortak.ps1"` ile yükler). Windows PowerShell 5.1 ile uyumlu.
 DENENMEDİ: bu betikler Windows Server'da çalıştırılmadı (sunucu yok). İlk kurulumda sırayla denenip düzeltilecek.
 Gizli değer içermez; env dosyası değerleri loga YAZILMAZ.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:VarsayilanKok = "C:\klinik"

function Yazdir([string]$Mesaj) { Write-Host ("[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Mesaj) }

function YoneticiIste {
  $kimlik = [Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not (New-Object Security.Principal.WindowsPrincipal($kimlik)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Bu betik yönetici olarak çalıştırılmalı."
  }
}

function KomutVarMi([string]$Ad) { return [bool](Get-Command $Ad -ErrorAction SilentlyContinue) }

# Harici komutu çalıştırır; çıkış kodu 0 değilse fırlatır. Argümanlar dizi olarak verilir (kabuk yorumlaması yok).
function Calistir([string]$Exe, [string[]]$Argumanlar, [string]$Aciklama = $Exe) {
  & $Exe @Argumanlar
  if ($LASTEXITCODE -ne 0) { throw "$Aciklama başarısız (çıkış kodu $LASTEXITCODE)" }
}

# KEY=VALUE satırlı env dosyasını hashtable'a okur (# yorum, boş satır atlanır, çevreleyen tırnak soyulur). Değerleri ASLA loglamayın.
function EnvOku([string]$Yol) {
  if (-not (Test-Path $Yol)) { throw "Env dosyası bulunamadı: $Yol" }
  $h = @{}
  foreach ($satir in Get-Content -Path $Yol -Encoding UTF8) {
    $t = $satir.Trim()
    if ($t -eq "" -or $t.StartsWith("#")) { continue }
    $i = $t.IndexOf("=")
    if ($i -lt 1) { continue }
    $deger = $t.Substring($i + 1).Trim()
    if ($deger.Length -ge 2 -and (($deger.StartsWith('"') -and $deger.EndsWith('"')) -or ($deger.StartsWith("'") -and $deger.EndsWith("'")))) {
      $deger = $deger.Substring(1, $deger.Length - 2)
    }
    $h[$t.Substring(0, $i).Trim()] = $deger
  }
  return $h
}

# /api/saglik 200 dönene kadar bekler. $true/$false.
function SaglikBekle([string]$Adres, [int]$ZamanAsimiSn = 90) {
  $son = (Get-Date).AddSeconds($ZamanAsimiSn)
  while ((Get-Date) -lt $son) {
    try {
      $r = Invoke-WebRequest -Uri $Adres -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Seconds 3
  }
  return $false
}

# Güvenli, basit tek-örnek kilidi: aynı anda iki güncelleme/yedek çalışmasın.
function KilitAl([string]$Yol) {
  try {
    $akis = [System.IO.File]::Open($Yol, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    return $akis
  } catch { return $null }
}

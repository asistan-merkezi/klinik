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

# Postgres URL'sini (postgres://kullanici:parola@host:port/veritabani) PG* ortam değişkenlerine açar: parola komut satırında görünmez.
# Yalnız localhost'a izin verir. Çağıran süreç sonunda `Remove-Item Env:PGPASSWORD` yapmalı.
function PgUrlAyarla([string]$Url) {
  $u = [uri]$Url
  if ($u.Host -notin "localhost", "127.0.0.1", "::1", "[::1]") { throw "Veritabani baglantisi yalniz localhost olabilir." }
  $kim = $u.UserInfo.Split(":", 2)
  $env:PGHOST = $u.Host; $env:PGPORT = "$(if ($u.Port -gt 0) { $u.Port } else { 5432 })"
  $env:PGUSER = [uri]::UnescapeDataString($kim[0]); $env:PGPASSWORD = [uri]::UnescapeDataString($kim[1])
  $env:PGDATABASE = $u.AbsolutePath.TrimStart("/")
}

function HesapCozulur([string]$Ad) {
  try { $nt = New-Object System.Security.Principal.NTAccount($Ad); [void]$nt.Translate([System.Security.Principal.SecurityIdentifier]); return $true } catch { return $false }
}

# NTFS izinleri (docs/sunucu-kurulum.md §3). Servis hesapları SANAL hesaplardır (NT SERVICE\<servis>) ve ancak servis kurulduktan sonra
# çözülür: çözülemeyen hesabın izni atlanır (uyarı), servis-kur.ps1 sonunda bu fonksiyon yeniden çağrılır. Bakım/yedek hesapları yerel kullanıcıdır.
function GizliIzinleriUygula([string]$Kok) {
  $uyg = "NT SERVICE\klinik-uygulama"; $cad = "NT SERVICE\klinik-caddy"
  $bak = "$env:COMPUTERNAME\svc-klinik-bakim"; $yed = "$env:COMPUTERNAME\svc-klinik-yedek"
  function Ver([string]$Yol, [string[]]$Haklar) {   # Haklar: "hesap|izin"
    & icacls $Yol /inheritance:r | Out-Null
    & icacls $Yol /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" | Out-Null
    foreach ($h in $Haklar) {
      $hesap, $izin = $h.Split("|")
      if (HesapCozulur $hesap) { & icacls $Yol /grant:r "${hesap}:$izin" | Out-Null } else { Yazdir "  (atlandi: '$hesap' henuz yok) $Yol" }
    }
  }
  Ver (Join-Path $Kok "gizli") @("$uyg|(X)", "$bak|(X)", "$yed|(X)")
  Ver (Join-Path $Kok "surumler") @("$uyg|(OI)(CI)RX", "$bak|(OI)(CI)RX")      # uygulama kodu: SALT OKUNUR (bakım betikleri guncel\scripts'ten çalışır)
  Ver (Join-Path $Kok "indirme") @()                                           # indirilen paket: yalnız yönetici/SYSTEM
  Ver (Join-Path $Kok "anahtarlar") @()                                        # güvenilen yayın açık anahtarları (minisign .pub): yalnız yönetici/SYSTEM yazar-okur
  Ver (Join-Path $Kok "durum") @("$uyg|(OI)(CI)R")                             # guncelle.ps1 durum dosyası (jeton süresi): yönetici yazar, uygulama SALT OKUR (/api/saglik)
  Ver (Join-Path $Kok "log") @("$uyg|(OI)(CI)M", "$cad|(OI)(CI)M", "$bak|(OI)(CI)M")
  Ver (Join-Path $Kok "dosya") @("$uyg|(OI)(CI)M", "$yed|(OI)(CI)RX")          # DOSYA_KOKU: uygulama yazar, yedek okur
  Ver (Join-Path $Kok "yedek") @("$yed|(OI)(CI)M")
  Ver (Join-Path $Kok "caddy-veri") @("$cad|(OI)(CI)M")
  # Gizli dosyalar: yalnız ilgili hesap OKUR; diğer hesaplara açık Deny. deploy.env (GitHub jetonu + migration parolası) yalnız yöneticiler/SYSTEM.
  $dosyalar = @(
    @{ ad = "uygulama.env"; oku = $uyg; red = @($bak, $yed, $cad) },
    @{ ad = "bakim.env";    oku = $bak; red = @($uyg, $yed, $cad) },
    @{ ad = "yedek.env";    oku = $yed; red = @($uyg, $bak, $cad) },
    @{ ad = "deploy.env";   oku = $null; red = @($uyg, $bak, $yed, $cad) }
  )
  foreach ($d in $dosyalar) {
    $yol = Join-Path $Kok "gizli\$($d.ad)"
    if (-not (Test-Path $yol)) { continue }
    & icacls $yol /inheritance:r | Out-Null
    & icacls $yol /grant:r "SYSTEM:F" "BUILTIN\Administrators:F" | Out-Null
    if ($d.oku -and (HesapCozulur $d.oku)) { & icacls $yol /grant:r "$($d.oku):R" | Out-Null }
    foreach ($r in $d.red) { if (HesapCozulur $r) { & icacls $yol /deny "${r}:(R,RX)" | Out-Null } }
    Yazdir "Izinler uygulandi: $($d.ad)"
  }
}

# GitHub API/yayın eki indirme. Jeton YALNIZ api.github.com'a gider; yönlendirilen depolama adresine (S3/CDN) JETON GÖNDERİLMEZ.
# $HedefDosya verilirse gövde dosyaya yazılır, yoksa metin döner. Hata iletilerinde jeton yer almaz.
function GitHubGetir([string]$Url, [string]$Jeton, [string]$Kabul, [string]$HedefDosya = "") {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Add-Type -AssemblyName System.Net.Http
  if ($Url -notmatch '^https://api\.github\.com/') { throw "Yalniz https://api.github.com adresleri kabul edilir." }
  $isleyici = New-Object System.Net.Http.HttpClientHandler
  $isleyici.AllowAutoRedirect = $false
  $istemci = New-Object System.Net.Http.HttpClient($isleyici)
  $istemci.Timeout = [TimeSpan]::FromMinutes(30)
  $yanit = $null
  try {
    $istek = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $Url)
    [void]$istek.Headers.TryAddWithoutValidation("Authorization", "Bearer $Jeton")
    [void]$istek.Headers.TryAddWithoutValidation("Accept", $Kabul)
    [void]$istek.Headers.TryAddWithoutValidation("User-Agent", "klinik-guncelle")
    [void]$istek.Headers.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28")
    $yanit = $istemci.SendAsync($istek).GetAwaiter().GetResult()
    # Fine-grained jeton son kullanma zamanı (GitHub her kimlikli yanıtta döner); yoksa $null kalır (klasik jeton / başlık yok).
    $global:GitHubJetonSonu = $null
    $degerler = $null
    if ($yanit.Headers.TryGetValues("github-authentication-token-expiration", [ref]$degerler)) {
      try { $global:GitHubJetonSonu = [datetime]::ParseExact((@($degerler)[0] -replace '\s*UTC$', '').Trim(), "yyyy-MM-dd HH:mm:ss", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal) } catch { }
    }
    if ([int]$yanit.StatusCode -eq 401 -or [int]$yanit.StatusCode -eq 403) { throw "JETON_REDDEDILDI: GitHub HTTP $([int]$yanit.StatusCode) (jeton suresi dolmus/iptal edilmis ya da yetkisiz)" }
    if ([int]$yanit.StatusCode -ge 300 -and [int]$yanit.StatusCode -lt 400) {
      $konum = $yanit.Headers.Location.AbsoluteUri
      if ($konum -notmatch '^https://') { throw "Beklenmeyen yonlendirme" }
      $yanit.Dispose()
      $istek2 = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $konum)   # Authorization YOK
      [void]$istek2.Headers.TryAddWithoutValidation("User-Agent", "klinik-guncelle")
      $yanit = $istemci.SendAsync($istek2).GetAwaiter().GetResult()
    }
    if (-not $yanit.IsSuccessStatusCode) { throw "GitHub istegi basarisiz: HTTP $([int]$yanit.StatusCode)" }
    if ($HedefDosya) {
      $akis = [System.IO.File]::Create($HedefDosya)
      try { $yanit.Content.CopyToAsync($akis).GetAwaiter().GetResult() } finally { $akis.Dispose() }
    } else { return $yanit.Content.ReadAsStringAsync().GetAwaiter().GetResult() }
  } finally { if ($yanit) { $yanit.Dispose() }; $istemci.Dispose() }
}

# Uzun rastgele parola (kriptografik RNG, yanlılıksız seçim). Tırnak/ters tırnak/$ gibi kabuk-hassas karakterler kullanılmaz.
function RastgeleParola([int]$Uzunluk = 40) {
  $set = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#%&*+-=?@^_~"
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $sinir = 256 - (256 % $set.Length)
  $sb = New-Object System.Text.StringBuilder
  $bayt = New-Object byte[] 1
  while ($sb.Length -lt $Uzunluk) { $rng.GetBytes($bayt); if ($bayt[0] -lt $sinir) { [void]$sb.Append($set[$bayt[0] % $set.Length]) } }
  $rng.Dispose()
  return $sb.ToString()
}

# LSA hesap hakları (Yerel Güvenlik İlkesi > Kullanıcı Hakları Atama). Hak adları: SeBatchLogonRight (toplu iş olarak oturum aç),
# SeDenyInteractiveLogonRight (yerel oturum açmayı reddet), SeDenyRemoteInteractiveLogonRight (Uzak Masaüstü ile oturum açmayı reddet).
if (-not ([System.Management.Automation.PSTypeName]'LsaHak').Type) {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
public static class LsaHak {
  [StructLayout(LayoutKind.Sequential)] struct LSA_OBJECT_ATTRIBUTES { public int Length; public IntPtr RootDirectory; public IntPtr ObjectName; public int Attributes; public IntPtr SecurityDescriptor; public IntPtr SecurityQualityOfService; }
  [StructLayout(LayoutKind.Sequential)] struct LSA_UNICODE_STRING_PTR { public ushort Length; public ushort MaximumLength; public IntPtr Buffer; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct LSA_UNICODE_STRING { public ushort Length; public ushort MaximumLength; [MarshalAs(UnmanagedType.LPWStr)] public string Buffer; }
  [DllImport("advapi32.dll")] static extern uint LsaOpenPolicy(IntPtr sistem, ref LSA_OBJECT_ATTRIBUTES nitelik, uint erisim, out IntPtr ilke);
  [DllImport("advapi32.dll")] static extern uint LsaAddAccountRights(IntPtr ilke, byte[] sid, ref LSA_UNICODE_STRING haklar, uint adet);
  [DllImport("advapi32.dll")] static extern uint LsaEnumerateAccountRights(IntPtr ilke, byte[] sid, out IntPtr haklar, out uint adet);
  [DllImport("advapi32.dll")] static extern uint LsaFreeMemory(IntPtr tampon);
  [DllImport("advapi32.dll")] static extern uint LsaClose(IntPtr ilke);
  [DllImport("advapi32.dll")] static extern int LsaNtStatusToWinError(uint durum);
  static IntPtr Ac() {
    var na = new LSA_OBJECT_ATTRIBUTES(); na.Length = Marshal.SizeOf(typeof(LSA_OBJECT_ATTRIBUTES));
    IntPtr ilke; uint d = LsaOpenPolicy(IntPtr.Zero, ref na, 0x00000810, out ilke);
    if (d != 0) throw new Exception("LsaOpenPolicy hata " + LsaNtStatusToWinError(d));
    return ilke;
  }
  static byte[] Sid(string hesap) {
    var sid = (SecurityIdentifier)new NTAccount(hesap).Translate(typeof(SecurityIdentifier));
    var b = new byte[sid.BinaryLength]; sid.GetBinaryForm(b, 0); return b;
  }
  public static void Ekle(string hesap, string hak) {
    var ilke = Ac();
    try {
      var s = new LSA_UNICODE_STRING(); s.Buffer = hak; s.Length = (ushort)(hak.Length * 2); s.MaximumLength = (ushort)(s.Length + 2);
      uint d = LsaAddAccountRights(ilke, Sid(hesap), ref s, 1);
      if (d != 0) throw new Exception("LsaAddAccountRights(" + hak + ") hata " + LsaNtStatusToWinError(d));
    } finally { LsaClose(ilke); }
  }
  public static string[] Listele(string hesap) {
    var ilke = Ac();
    try {
      IntPtr tampon; uint adet; uint d = LsaEnumerateAccountRights(ilke, Sid(hesap), out tampon, out adet);
      if (d != 0) { if (LsaNtStatusToWinError(d) == 2) return new string[0]; throw new Exception("LsaEnumerateAccountRights hata " + LsaNtStatusToWinError(d)); }
      var liste = new string[adet];
      int boy = Marshal.SizeOf(typeof(LSA_UNICODE_STRING_PTR));
      for (int i = 0; i < adet; i++) {
        var o = (LSA_UNICODE_STRING_PTR)Marshal.PtrToStructure(new IntPtr(tampon.ToInt64() + i * boy), typeof(LSA_UNICODE_STRING_PTR));
        liste[i] = Marshal.PtrToStringUni(o.Buffer, o.Length / 2);
      }
      LsaFreeMemory(tampon);
      return liste;
    } finally { LsaClose(ilke); }
  }
}
"@
}

# Zamanlanmış iş (bakım/yedek) hesabı hakları: toplu iş olarak oturum açabilir; etkileşimli ve Uzak Masaüstü oturum açma REDDEDİLİR. Doğrular, eksikse fırlatır.
function ZamanlanmisHesapHaklari([string]$Hesap) {
  foreach ($hak in "SeBatchLogonRight", "SeDenyInteractiveLogonRight", "SeDenyRemoteInteractiveLogonRight") { [LsaHak]::Ekle($Hesap, $hak) }
  $var = [LsaHak]::Listele($Hesap)
  foreach ($hak in "SeBatchLogonRight", "SeDenyInteractiveLogonRight", "SeDenyRemoteInteractiveLogonRight") {
    if ($var -notcontains $hak) { throw "$Hesap icin '$hak' hakki dogrulanamadi (mevcut: $($var -join ', '))" }
  }
}

# Sürüm paketi imzası (minisign). Sunucudaki GÜVENİLEN açık anahtarlarla (<Kok>\anahtarlar\*.pub; paketle gelmez, yönetici elle koyar) doğrulanır:
# herhangi biri doğrularsa kabul. İmzalı (trusted) yorum beklenenle ("klinik-<etiket>") AYNI olmalı → eski bir sürümün geçerli imzası yeni sürüm gibi sunulamaz.
# Başarısızlıkta fırlatır (çağıran paketi AÇMADAN reddeder). Dönüş: doğrulayan anahtar dosyasının adı.
function ImzaDogrula([string]$Zip, [string]$Imza, [string]$AnahtarKlasoru, [string]$BeklenenYorum) {
  if (-not (KomutVarMi "minisign")) { throw "IMZA: minisign bulunamadi (kurulum.ps1); paket dogrulanamadi, reddedildi." }
  if (-not (Test-Path $Imza)) { throw "IMZA YOK: $(Split-Path $Imza -Leaf) — imzasiz paket REDDEDILDI." }
  $anahtarlar = @(Get-ChildItem $AnahtarKlasoru -Filter "*.pub" -ErrorAction SilentlyContinue)
  if ($anahtarlar.Count -eq 0) { throw "IMZA: guvenilen yayin acik anahtari yok ($AnahtarKlasoru\*.pub); paket dogrulanamaz, reddedildi." }
  foreach ($a in $anahtarlar) {
    $cikti = & minisign -V -m $Zip -p $a.FullName -x $Imza
    if ($LASTEXITCODE -eq 0) {
      $yorum = $cikti | Where-Object { $_ -like "Trusted comment:*" } | Select-Object -First 1
      if (-not $yorum -or $yorum.Substring("Trusted comment:".Length).Trim() -ne $BeklenenYorum) {
        throw "IMZA: imza gecerli ama imzali yorum beklenenle ($BeklenenYorum) uyusmuyor (baska/eski surum imzasi olabilir); reddedildi."
      }
      return $a.Name
    }
  }
  throw "IMZA GECERSIZ: guvenilen hicbir acik anahtarla dogrulanamadi; paket REDDEDILDI."
}

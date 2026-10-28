// Veritabanında saklanan dış servis gizlilerini (Paraşüt client secret vb.) UYGULAMA anahtarıyla şifreler: AES-256-GCM.
//   • Anahtar yalnız ortam değişkeninden gelir (GIZLI_VERI_ANAHTARI = 32 bayt, base64); dosyaya/koda/veritabanına YAZILMAZ.
//   • Şifreli metin kliniğe BAĞLANIR (AAD = baglam, örn. klinik_id): bir kliniğin şifreli değeri başka kliniğin satırına kopyalansa çözülmez.
//   • Biçim: "enc:v1:<iv>:<etiket>:<şifreli>" (base64url). Sürüm öneki, ileride anahtar döndürme için yer açar.
// Düz değer ASLA loglanmaz, istemciye gönderilmez (kolon SELECT yetkisi de uygulama rolüne kapalıdır; bkz. migration 0006).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class GizliAnahtarYok extends Error {
  constructor() {
    super("GIZLI_VERI_ANAHTARI tanımlı değil veya geçersiz (32 bayt base64 olmalı).");
    this.name = "GizliAnahtarYok";
  }
}

const ONEK = "enc:v1:";

function anahtarAl(): Buffer {
  const ham = process.env.GIZLI_VERI_ANAHTARI;
  if (!ham) throw new GizliAnahtarYok();
  const anahtar = Buffer.from(ham, "base64");
  if (anahtar.length !== 32) throw new GizliAnahtarYok();
  return anahtar;
}

export const sifreliMi = (deger: string | null | undefined): boolean => !!deger && deger.startsWith(ONEK);

export function gizliSifrele(duz: string, baglam: string): string {
  const iv = randomBytes(12);
  const sifre = createCipheriv("aes-256-gcm", anahtarAl(), iv);
  sifre.setAAD(Buffer.from(baglam, "utf8"));
  const sifreli = Buffer.concat([sifre.update(duz, "utf8"), sifre.final()]);
  return `${ONEK}${iv.toString("base64url")}:${sifre.getAuthTag().toString("base64url")}:${sifreli.toString("base64url")}`;
}

/** Yanlış anahtar / değiştirilmiş veri / yanlış bağlam için fırlatır (GCM kimlik doğrulaması). */
export function gizliCoz(sifreli: string, baglam: string): string {
  if (!sifreliMi(sifreli)) throw new Error("Değer şifreli biçimde değil.");
  const [ivB, etiketB, veriB] = sifreli.slice(ONEK.length).split(":");
  if (!ivB || !etiketB || !veriB) throw new Error("Şifreli değer bozuk.");
  const coz = createDecipheriv("aes-256-gcm", anahtarAl(), Buffer.from(ivB, "base64url"));
  coz.setAAD(Buffer.from(baglam, "utf8"));
  coz.setAuthTag(Buffer.from(etiketB, "base64url"));
  return Buffer.concat([coz.update(Buffer.from(veriB, "base64url")), coz.final()]).toString("utf8");
}

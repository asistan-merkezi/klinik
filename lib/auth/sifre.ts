// Parola karması: argon2id (@node-rs/argon2). Better Auth'un password.hash/verify seçenekleri ve hesap oluşturma aynı fonksiyonları kullanır.
// Parametreler Better Auth belgesindeki örnekle aynıdır (memoryCost 64 MiB, timeCost 3, parallelism 4, argon2id).
import { randomInt } from "node:crypto";
import { hash, verify, type Options } from "@node-rs/argon2";

// algorithm: 2 = Argon2id (const enum olduğundan sayı olarak verilir)
const SECENEKLER: Options = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32, algorithm: 2 };

export async function sifreHashle(sifre: string): Promise<string> {
  return hash(sifre, SECENEKLER);
}

export async function sifreDogrula(veri: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(veri.hash, veri.password, SECENEKLER);
  } catch {
    return false;
  }
}

/** Var olmayan hesapta da aynı süreyi harcamak için (zamanlama farkıyla hesap varlığı sızmasın). */
let sahteHash: Promise<string> | undefined;
export async function sahteDogrulama(sifre: string): Promise<void> {
  sahteHash ??= sifreHashle("zamanlama-esitleme-" + Math.random());
  await sifreDogrula({ hash: await sahteHash, password: sifre });
}

/** Yeni şifre politikası: en az 10 karakter, en az bir harf ve bir rakam. */
export const SIFRE_MIN_UZUNLUK = 10;
export function sifrePolitikasiHatasi(sifre: string): string | null {
  if (sifre.length < SIFRE_MIN_UZUNLUK) return `Şifre en az ${SIFRE_MIN_UZUNLUK} karakter olmalı.`;
  if (sifre.length > 128) return "Şifre çok uzun.";
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(sifre) || !/[0-9]/.test(sifre)) return "Şifre en az bir harf ve bir rakam içermeli.";
  return null;
}

const ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O/1/I karışmasın
/** Geçici şifre (yöneticinin/resepsiyonun hastaya/personele ilettiği): 12 karakter, kriptografik rastgele. */
export function geciciSifreUret(uzunluk = 12): string {
  let s = "";
  for (let i = 0; i < uzunluk; i++) s += ALFABE[randomInt(ALFABE.length)];
  return s;
}

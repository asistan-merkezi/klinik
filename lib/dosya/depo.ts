// Dosya deposu: web kökü DIŞINDAKİ DOSYA_KOKU klasörü. Dosyalar doğrudan servis edilmez; yalnız yetkili route'lar okur.
// Düzen: DOSYA_KOKU/<kategori>/<segment>/<segment>/.../<ad>.<uzanti> (ör. klinik-logo/<klinik_id>/logo.png, hasta-belge/<klinik_id>/<hasta_id>/<kategori>/<belge_id>.<ext>).
// Güvenlik: her yol parçası beyaz listeyle doğrulanır (.. / mutlak yol / ters eğik çizgi / boş parça reddedilir) ve çözümlenen yol kökün İÇİNDE kalmalıdır.
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const DOSYA_KATEGORILERI = ["klinik-logo", "hasta-belge", "personel-belge"] as const;
export type DosyaKategorisi = (typeof DOSYA_KATEGORILERI)[number];

export class DosyaHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "DosyaHatasi";
  }
}

const PARCA = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function dosyaKoku(): string {
  const kok = process.env.DOSYA_KOKU;
  if (!kok) throw new DosyaHatasi("DOSYA_KOKU ortam değişkeni tanımlı değil");
  return path.resolve(kok);
}

/** Kategori + yol parçalarını doğrulayıp kök içindeki mutlak yola çevirir. */
export function dosyaYolu(kategori: DosyaKategorisi, parcalar: readonly string[]): string {
  if (!DOSYA_KATEGORILERI.includes(kategori)) throw new DosyaHatasi("Geçersiz dosya kategorisi");
  if (parcalar.length === 0) throw new DosyaHatasi("Dosya yolu boş");
  for (const p of parcalar) if (!PARCA.test(p) || p.includes("..")) throw new DosyaHatasi("Geçersiz dosya yolu parçası");
  const kok = dosyaKoku();
  const tam = path.resolve(kok, kategori, ...parcalar);
  if (!tam.startsWith(path.join(kok, kategori) + path.sep)) throw new DosyaHatasi("Dosya yolu kök dışına çıkıyor");
  return tam;
}

/** Atomik yazım: geçici dosya + rename (yarım yazılmış dosya okunmaz). */
export async function dosyaYaz(kategori: DosyaKategorisi, parcalar: readonly string[], veri: Buffer | Uint8Array): Promise<void> {
  const hedef = dosyaYolu(kategori, parcalar);
  await fs.mkdir(path.dirname(hedef), { recursive: true });
  const gecici = `${hedef}.${randomUUID()}.tmp`;
  await fs.writeFile(gecici, veri, { flag: "wx" });
  await fs.rename(gecici, hedef);
}

export async function dosyaOku(kategori: DosyaKategorisi, parcalar: readonly string[]): Promise<Buffer | null> {
  try {
    return await fs.readFile(dosyaYolu(kategori, parcalar));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function dosyaSil(kategori: DosyaKategorisi, parcalar: readonly string[]): Promise<void> {
  try {
    await fs.unlink(dosyaYolu(kategori, parcalar));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

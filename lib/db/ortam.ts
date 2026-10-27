// Bağlantı bilgileri YALNIZ ortam değişkeninden okunur; hiçbir dosyaya yazılmaz (docs/sunucu-kurulum.md: uygulama.env / bakim.env).
export type BaglantiAdi = "DATABASE_URL" | "KIMLIK_DATABASE_URL" | "BAKIM_DATABASE_URL";

export function baglantiAdresi(ad: BaglantiAdi): string {
  const deger = process.env[ad];
  if (!deger) throw new Error(`${ad} ortam değişkeni tanımlı değil`);
  return deger;
}

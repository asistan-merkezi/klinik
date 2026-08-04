const RENK_PALETI = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  "bg-orange-500/15 text-orange-600 dark:text-orange-400",
] as const;

/** Ada göre sabit (deterministik) bir renk çifti — aynı isim her zaman aynı rengi alır. */
export function renkUret(adSoyad: string): string {
  let toplam = 0;
  for (let i = 0; i < adSoyad.length; i++) {
    toplam += adSoyad.charCodeAt(i);
  }
  return RENK_PALETI[toplam % RENK_PALETI.length];
}

/** İlk ve son kelimenin ilk harflerini büyük olarak döner (örn. "Ahmet Yılmaz" -> "AY"). */
export function baslangicHarfleriAl(adSoyad: string): string {
  const kelimeler = adSoyad.trim().split(/\s+/).filter(Boolean);
  if (kelimeler.length === 0) return "?";
  const ilk = kelimeler[0].charAt(0);
  const son = kelimeler.length > 1 ? kelimeler[kelimeler.length - 1].charAt(0) : "";
  return (ilk + son).toLocaleUpperCase("tr-TR");
}

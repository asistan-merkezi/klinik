export function tcKimlikGecerliMi(deger: string): boolean {
  if (!/^\d{11}$/.test(deger)) return false;
  if (deger[0] === "0") return false;

  const r = deger.split("").map(Number);
  const tekToplam = r[0] + r[2] + r[4] + r[6] + r[8];
  const ciftToplam = r[1] + r[3] + r[5] + r[7];
  const onuncuHane = (((tekToplam * 7 - ciftToplam) % 10) + 10) % 10;
  if (onuncuHane !== r[9]) return false;

  const ilkOnToplam = r.slice(0, 10).reduce((acc, d) => acc + d, 0);
  const onbirinciHane = ilkOnToplam % 10;
  return onbirinciHane === r[10];
}

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Her kelimenin ilk harfini büyütür, gerisini küçültür (Türkçe İ/ı duyarlı). */
export function isimBasHarfBuyukYap(deger: string): string {
  return deger
    .split(" ")
    .map((kelime) =>
      kelime.length === 0
        ? kelime
        : kelime.charAt(0).toLocaleUpperCase("tr-TR") + kelime.slice(1).toLocaleLowerCase("tr-TR")
    )
    .join(" ")
}

/** Yerel (0xxx...) veya uluslararası formatlı telefonu wa.me linki için 90xxxxxxxxxx biçimine çevirir. */
export function whatsappLinkOlustur(telefon: string, mesaj: string): string {
  const rakamlar = telefon.replace(/\D/g, "");
  const uluslararasi = rakamlar.startsWith("90")
    ? rakamlar
    : rakamlar.startsWith("0")
      ? `90${rakamlar.slice(1)}`
      : `90${rakamlar}`;
  return `https://wa.me/${uluslararasi}?text=${encodeURIComponent(mesaj)}`;
}

export function gunAraligi(tarih: Date = new Date()) {
  const baslangic = new Date(Date.UTC(tarih.getUTCFullYear(), tarih.getUTCMonth(), tarih.getUTCDate()));
  const bitis = new Date(baslangic);
  bitis.setUTCDate(bitis.getUTCDate() + 1);
  return { baslangic: baslangic.toISOString(), bitis: bitis.toISOString() };
}

export function haftaAraligi(tarih: Date = new Date()) {
  const gun = tarih.getUTCDay();
  const pazartesiFarki = gun === 0 ? -6 : 1 - gun;
  const baslangic = new Date(
    Date.UTC(tarih.getUTCFullYear(), tarih.getUTCMonth(), tarih.getUTCDate() + pazartesiFarki)
  );
  const bitis = new Date(baslangic);
  bitis.setUTCDate(bitis.getUTCDate() + 7);
  return { baslangic: baslangic.toISOString(), bitis: bitis.toISOString() };
}

/** ayParam "YYYY-MM" formatında; verilmez veya hatalıysa içinde bulunulan ay kullanılır. */
export function ayAraligi(ayParam?: string) {
  const simdi = new Date();
  let yil = simdi.getUTCFullYear();
  let ay = simdi.getUTCMonth();

  if (ayParam && /^\d{4}-\d{2}$/.test(ayParam)) {
    const [ayYil, ayAy] = ayParam.split("-").map(Number);
    yil = ayYil;
    ay = ayAy - 1;
  }

  const baslangic = new Date(Date.UTC(yil, ay, 1));
  const bitis = new Date(Date.UTC(yil, ay + 1, 1));
  const oncekiAy = new Date(Date.UTC(yil, ay - 1, 1));
  const sonrakiAy = new Date(Date.UTC(yil, ay + 1, 1));

  return {
    baslangic: baslangic.toISOString(),
    bitis: bitis.toISOString(),
    etiket: baslangic.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
    param: `${yil}-${String(ay + 1).padStart(2, "0")}`,
    oncekiParam: `${oncekiAy.getUTCFullYear()}-${String(oncekiAy.getUTCMonth() + 1).padStart(2, "0")}`,
    sonrakiParam: `${sonrakiAy.getUTCFullYear()}-${String(sonrakiAy.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}

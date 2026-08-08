import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatInTimeZone } from "date-fns-tz"
import { CLINIC_TZ, endOfDayUTC, formatDateForInput, startOfDayUTC } from "./datetime"

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

/** Var olan bir telefon değerinden ("0532...", "+90532...", "90532...") +90 önekli 10 haneli giriş kutusunu doldurmak için son 10 haneyi çıkarır. */
export function telefonYerelHaneleriCikar(telefon: string | null | undefined): string {
  if (!telefon) return ""
  let rakamlar = telefon.replace(/\D/g, "")
  if (rakamlar.startsWith("90") && rakamlar.length > 10) rakamlar = rakamlar.slice(2)
  if (rakamlar.startsWith("0")) rakamlar = rakamlar.slice(1)
  return rakamlar.slice(0, 10)
}

/** "YYYY-MM-DD" doğum tarihi bugün itibarıyla 18 yaşından küçükse true döner. */
export function resitDegilMi(dogumTarihi: string): boolean {
  const dogum = new Date(dogumTarihi)
  if (Number.isNaN(dogum.getTime())) return false
  const bugun = new Date()
  let yas = bugun.getFullYear() - dogum.getFullYear()
  const ayFarki = bugun.getMonth() - dogum.getMonth()
  if (ayFarki < 0 || (ayFarki === 0 && bugun.getDate() < dogum.getDate())) yas--
  return yas < 18
}

/** Telefonu listelerde okunaklı göstermek için "532 2275512" biçimine çevirir (3+7 hane). */
export function telefonGoster(telefon: string | null | undefined): string {
  const yerel = telefonYerelHaneleriCikar(telefon)
  if (yerel.length !== 10) return telefon ?? ""
  return `${yerel.slice(0, 3)} ${yerel.slice(3)}`
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

/**
 * Verilen anın İstanbul takvim gününün [00:00, ertesi gün 00:00) aralığı,
 * UTC ISO string olarak (örn. "bugünün randevuları" sorgusu için). Önceden
 * burada doğrudan Date.UTC(...) ile UTC takvim günü hesaplanıyordu — İstanbul
 * UTC+3 olduğu için 00:00-03:00 arası İstanbul saatleri yanlış güne
 * düşüyordu. Artık lib/datetime.ts'teki tek TZ kaynağından türetiliyor.
 */
export function gunAraligi(tarih: Date = new Date()) {
  return { baslangic: startOfDayUTC(tarih), bitis: endOfDayUTC(tarih) };
}

/** Pazartesi-Pazar İstanbul takvim haftası, [baslangic, bitis) UTC ISO olarak. */
export function haftaAraligi(tarih: Date = new Date()) {
  const isoGun = Number(formatInTimeZone(tarih, CLINIC_TZ, "i")); // 1 (Pzt) .. 7 (Paz), İstanbul takviminde
  const GUN_MS = 24 * 60 * 60 * 1000;
  const bugunBaslangicMs = new Date(startOfDayUTC(tarih)).getTime();
  const baslangic = new Date(bugunBaslangicMs - (isoGun - 1) * GUN_MS);
  const bitis = new Date(baslangic.getTime() + 7 * GUN_MS);
  return { baslangic: baslangic.toISOString(), bitis: bitis.toISOString() };
}

/**
 * İstanbul takviminde ayın 1'inin 00:00'ı, UTC ISO olarak. Referans anı
 * (öğle UTC) kasıtlı: İstanbul'a çevrildiğinde her zaman aynı takvim
 * gününde kalır, ay/gün kaymasına karşı güvenlidir.
 */
export function ayBaslangiciUTC(yil: number, ay0Indeksli: number): string {
  const guvenliAn = new Date(Date.UTC(yil, ay0Indeksli, 1, 12));
  return startOfDayUTC(guvenliAn);
}

/** ayParam "YYYY-MM" formatında; verilmez veya hatalıysa içinde bulunulan ay (İstanbul) kullanılır. */
export function ayAraligi(ayParam?: string) {
  const simdiIstanbul = formatInTimeZone(new Date(), CLINIC_TZ, "yyyy-MM");
  let [yil, ayInsan] = simdiIstanbul.split("-").map(Number); // ayInsan: 1-12

  if (ayParam && /^\d{4}-\d{2}$/.test(ayParam)) {
    const [ayYil, ayAy] = ayParam.split("-").map(Number);
    yil = ayYil;
    ayInsan = ayAy;
  }

  const ay0 = ayInsan - 1;
  const baslangicIso = ayBaslangiciUTC(yil, ay0);
  const bitisIso = ayBaslangiciUTC(yil, ay0 + 1);

  // Sadece ay/yıl etiketi türetmek için kalender aritmetiği (gün hassasiyeti
  // gerekmiyor, TZ'den bağımsız güvenli).
  const oncekiAy = new Date(Date.UTC(yil, ay0 - 1, 1));
  const sonrakiAy = new Date(Date.UTC(yil, ay0 + 1, 1));

  return {
    baslangic: baslangicIso,
    bitis: bitisIso,
    /** personel_ekstra_hakedis.tarih gibi `date` (timezone'suz) kolonlarla karşılaştırmak için. */
    baslangicTarih: formatDateForInput(baslangicIso),
    bitisTarih: formatDateForInput(bitisIso),
    etiket: new Date(baslangicIso).toLocaleDateString("tr-TR", {
      month: "long",
      year: "numeric",
      timeZone: CLINIC_TZ,
    }),
    param: `${yil}-${String(ayInsan).padStart(2, "0")}`,
    oncekiParam: `${oncekiAy.getUTCFullYear()}-${String(oncekiAy.getUTCMonth() + 1).padStart(2, "0")}`,
    sonrakiParam: `${sonrakiAy.getUTCFullYear()}-${String(sonrakiAy.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}

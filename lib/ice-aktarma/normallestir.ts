// Arşiv İçe Aktarma: kaynak dosyadan gelen serbest metin hücre değerlerini
// RPC'lerin beklediği temiz tiplere çevirir (sayı/tarih/boolean). Bu normalleştirme
// bilinçli olarak client'ta (sütun eşleştirme sonrası, gönderim öncesi) yapılır —
// RPC'ler her zaman temiz ISO/numeric girdi bekler, kaynak veri kalitesi
// belirsizliğiyle uğraşmaz (sistem sınırında doğrulama prensibi).

// Türkçe Excel'de ondalık ayracı "," , binlik ayracı "." olabilir (1.234,56).
// Zaten "." ondalık olarak gelen değerleri (1234.56) de olduğu gibi kabul eder.
export function turkceSayiyiCevir(deger: string): number | null {
  const temiz = deger.trim();
  if (!temiz) return null;

  const virgulluMi = temiz.includes(",");
  const normalize = virgulluMi ? temiz.replace(/\./g, "").replace(",", ".") : temiz;

  const sayi = Number(normalize.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(sayi) ? sayi : null;
}

// "15.03.2024", "15/03/2024", "2024-03-15" -> "2024-03-15" (Postgres date).
// exceljs gerçek tarih hücrelerini zaten ISO'ya çeviriyor (bkz. dosya-oku.ts);
// bu fonksiyon esas olarak CSV'den gelen serbest metin tarihleri karşılıyor.
export function tarihiIsoyaCevir(deger: string): string | null {
  const temiz = deger.trim();
  if (!temiz) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(temiz)) {
    return temiz.slice(0, 10);
  }

  const parcalar = temiz.split(/[./]/);
  if (parcalar.length === 3) {
    const [gun, ay, yil] = parcalar;
    if (gun && ay && yil && /^\d{1,2}$/.test(gun) && /^\d{1,2}$/.test(ay) && /^\d{4}$/.test(yil)) {
      return `${yil}-${ay.padStart(2, "0")}-${gun.padStart(2, "0")}`;
    }
  }

  return null;
}

const EVET_DEGERLERI = new Set(["evet", "var", "true", "1", "yes", "e"]);

export function metniBooleanaCevir(deger: string): boolean {
  return EVET_DEGERLERI.has(deger.trim().toLowerCase());
}

// "15.03.2024 14:30" / "2024-03-15T14:30" -> timestamptz için ISO string.
// saat verilmemişse günün başlangıcı varsayılır.
export function tarihSaatiIsoyaCevir(deger: string): string | null {
  const temiz = deger.trim();
  if (!temiz) return null;

  const [tarihKismi, saatKismiHam] = temiz.split(/[ T]/);
  const isoTarih = tarihiIsoyaCevir(tarihKismi);
  if (!isoTarih) return null;

  const saatKismi = saatKismiHam && /^\d{1,2}:\d{2}(:\d{2})?$/.test(saatKismiHam) ? saatKismiHam : "00:00";
  return `${isoTarih}T${saatKismi.length === 5 ? saatKismi + ":00" : saatKismi}`;
}

// Telefon eşleştirmesi için kanonik anahtar: sistemde hasta.telefon serbest
// metin olarak tutuluyor (resepsiyonun elle girdiği format — "0532 123 45 67",
// "+90 532...", boşluklu/boşluksuz karışık, bkz. hastalar/actions.ts'teki
// telefonSemasi). Arşiv dosyasındaki format sistemdekiyle birebir aynı
// olmayabilir — bu yüzden eşleştirme HER ZAMAN bu anahtar üzerinden yapılmalı,
// ham string karşılaştırmasıyla değil. Tüm rakam olmayan karakterleri atıp son
// 10 haneyi alır (Türkiye cep telefonu — başındaki 0/+90 farkı elenmiş olur).
export function telefonAnahtari(deger: string): string {
  const rakamlar = deger.replace(/\D/g, "");
  return rakamlar.slice(-10);
}

// Arşiv İçe Aktarma: Excel (.xlsx/.xls) ve CSV dosyalarını tarayıcıda (client-side)
// okuyup ortak bir {basliklar, satirlar} biçimine çevirir. Sunucuya ham dosya değil,
// bu fonksiyonun ürettiği satırlar (kullanıcının Sütun Eşleştirme adımından geçtikten
// sonra) gönderilir — hasta-belge yükleme akışındaki "büyük dosyayı Server Action'a
// göndermeme" prensibiyle tutarlı.
//
// xlsx (SheetJS) npm paketi bilinçli olarak KULLANILMADI: npm'deki son sürüm
// (0.18.5) prototip kirliliği + ReDoS için 2 yüksek önemli, düzeltilmemiş güvenlik
// açığı taşıyor (SheetJS npm'de yama yayınlamıyor, kendi CDN'lerinden kurulum
// istiyor). Onun yerine aktif bakımı süren `exceljs` kullanıldı.

import type ExcelJSType from "exceljs";

export type OkunmusDosya = {
  basliklar: string[];
  satirlar: Record<string, string>[];
};

export async function dosyadanSatirlarOku(dosya: File): Promise<OkunmusDosya> {
  const uzanti = dosya.name.split(".").pop()?.toLowerCase();
  if (uzanti === "csv") {
    return csvDosyasiniOku(dosya);
  }
  return excelDosyasiniOku(dosya);
}

async function excelDosyasiniOku(dosya: File): Promise<OkunmusDosya> {
  const { default: ExcelJS } = await import("exceljs");
  const arabellek = await dosya.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arabellek);

  const sayfa = workbook.worksheets[0];
  if (!sayfa) {
    return { basliklar: [], satirlar: [] };
  }

  let basliklar: string[] = [];
  const satirlar: Record<string, string>[] = [];

  sayfa.eachRow((satir, satirNo) => {
    const degerler = hucreDizisiniMetneCevir(satir.values);

    if (satirNo === 1) {
      basliklar = degerler.map((deger, i) => (deger.trim() ? deger.trim() : `Sütun ${i + 1}`));
      return;
    }

    const kayit: Record<string, string> = {};
    basliklar.forEach((baslik, i) => {
      kayit[baslik] = degerler[i] ?? "";
    });
    if (Object.values(kayit).some((deger) => deger !== "")) {
      satirlar.push(kayit);
    }
  });

  return { basliklar, satirlar };
}

function hucreDizisiniMetneCevir(values: ExcelJSType.CellValue[] | { [key: string]: ExcelJSType.CellValue }): string[] {
  const dizi = Array.isArray(values) ? values.slice(1) : [];
  return dizi.map(hucreDegeriniMetneCevir);
}

function hucreDegeriniMetneCevir(deger: ExcelJSType.CellValue): string {
  if (deger === null || deger === undefined) {
    return "";
  }
  if (deger instanceof Date) {
    return deger.toISOString().slice(0, 10);
  }
  if (typeof deger === "object") {
    if ("richText" in deger && Array.isArray(deger.richText)) {
      return deger.richText.map((parca) => parca.text).join("");
    }
    if ("text" in deger && typeof deger.text === "string") {
      return deger.text;
    }
    if ("result" in deger && deger.result !== undefined) {
      return hucreDegeriniMetneCevir(deger.result as ExcelJSType.CellValue);
    }
    return "";
  }
  return String(deger).trim();
}

async function csvDosyasiniOku(dosya: File): Promise<OkunmusDosya> {
  const metin = await dosya.text();
  const satirlarHam = csvMetniniAyristir(metin);

  if (satirlarHam.length === 0) {
    return { basliklar: [], satirlar: [] };
  }

  const basliklar = satirlarHam[0].map((deger, i) => (deger.trim() ? deger.trim() : `Sütun ${i + 1}`));
  const satirlar = satirlarHam
    .slice(1)
    .filter((satir) => satir.some((deger) => deger.trim() !== ""))
    .map((satir) => {
      const kayit: Record<string, string> = {};
      basliklar.forEach((baslik, i) => {
        kayit[baslik] = (satir[i] ?? "").trim();
      });
      return kayit;
    });

  return { basliklar, satirlar };
}

// Türkçe Excel varsayılan olarak CSV'yi ";" ile ayırır (çünkü "," ondalık
// ayracı) — dosyanın ilk satırındaki geçme sayısına bakarak ayracı otomatik
// belirliyoruz, ikisini birden ayraç saymak "1234,56" gibi ondalıklı bir
// hücreyi yanlışlıkla ikiye bölerdi.
function csvAyraciniBelirle(ilkSatir: string): "," | ";" {
  const virgulSayisi = (ilkSatir.match(/,/g) ?? []).length;
  const noktaliVirgulSayisi = (ilkSatir.match(/;/g) ?? []).length;
  return noktaliVirgulSayisi > virgulSayisi ? ";" : ",";
}

function csvMetniniAyristir(metin: string): string[][] {
  const ilkSatirSonu = metin.search(/\r\n|\n/);
  const ilkSatir = ilkSatirSonu === -1 ? metin : metin.slice(0, ilkSatirSonu);
  const ayrac = csvAyraciniBelirle(ilkSatir);

  const satirlar: string[][] = [];
  let satir: string[] = [];
  let alan = "";
  let tirnakIcinde = false;

  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];

    if (tirnakIcinde) {
      if (c === '"' && metin[i + 1] === '"') {
        alan += '"';
        i++;
      } else if (c === '"') {
        tirnakIcinde = false;
      } else {
        alan += c;
      }
      continue;
    }

    if (c === '"') {
      tirnakIcinde = true;
    } else if (c === ayrac) {
      satir.push(alan);
      alan = "";
    } else if (c === "\r") {
      // \r\n durumunda \n'de satır kapatılır, tek başına \r yok sayılır
    } else if (c === "\n") {
      satir.push(alan);
      satirlar.push(satir);
      satir = [];
      alan = "";
    } else {
      alan += c;
    }
  }

  if (alan.length > 0 || satir.length > 0) {
    satir.push(alan);
    satirlar.push(satir);
  }

  return satirlar.filter((s) => !(s.length === 1 && s[0].trim() === ""));
}

// LLM'e gitmeden önce kullanıcı metninden kişisel/finansal tanımlayıcıları siler (yalnız chatbot AÇIKKEN devreye girer).
// Kapsam: IBAN, kart no (13-19 hane, boşluk/tire ayraçlı), T.C. kimlik no (11 hane), telefon, e-posta. Ad-soyad ve sağlık metni TESPİT EDİLEMEZ:
// bu yüzden sohbet ekranında "hasta bilgisi yazmayın" uyarısı vardır ve bayrak varsayılan kapalıdır.
const KALIPLAR: [RegExp, string][] = [
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/gi, "[IBAN]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[KART/NUMARA]"],
  [/\b[1-9]\d{10}\b/g, "[TC]"],
  [/(?:\+?90[ ]?)?\(?0?5\d{2}\)?[ -]?\d{3}[ -]?\d{2}[ -]?\d{2}\b/g, "[TELEFON]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[E-POSTA]"],
];

export function metniMaskele(metin: string): string {
  return KALIPLAR.reduce((m, [kalip, yerine]) => m.replace(kalip, yerine), metin);
}

type Parca = { type: string; text?: string };

/** UIMessage listesindeki tüm metin parçalarını maskeler; metin dışı parçalar (dosya, araç çağrısı) DÜŞÜRÜLÜR — modele yalnız maskeli metin gider. */
export function mesajlariMaskele<T extends { parts: readonly unknown[] }>(mesajlar: T[]): T[] {
  return mesajlar.map((m) => ({
    ...m,
    parts: (m.parts as Parca[]).filter((p) => p && p.type === "text" && typeof p.text === "string").map((p) => ({ ...p, text: metniMaskele(p.text as string) })),
  })) as T[];
}

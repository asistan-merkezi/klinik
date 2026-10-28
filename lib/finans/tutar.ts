// Form/istek tutarı doğrulaması: metin → KURUŞ (güvenli tamsayı). Yuvarlama KURALI lib/para.ts'te (tek yer); burada yalnız KABUL kuralı var:
// en çok iki ondalık, virgül veya nokta, pozitif, makul üst sınır. Üçüncü ondalık sessizce yuvarlanmaz — reddedilir.
import { z } from "zod";
import { kurus, kurusMetni } from "@/lib/para";

const ENFAZLA_KURUS = 999_999_999_999; // 9.999.999.999,99 ₺ (numeric(12,2) sınırı)

function kurusaCevir(girdi: unknown, ctx: z.RefinementCtx, seceneklar: { sifirDahil: boolean; negatifDahil: boolean; mesaj: string }): number {
  // Boş alan (form göndermedi / boş bıraktı) 0 sayılır — yalnız sıfırı kabul eden alanlarda (iskonto, başlangıç tutarı); eski z.coerce.number() davranışı.
  if (seceneklar.sifirDahil && !seceneklar.negatifDahil && (girdi === null || girdi === undefined || (typeof girdi === "string" && girdi.trim() === ""))) return 0;
  const metin = typeof girdi === "number" ? String(girdi) : typeof girdi === "string" ? girdi.trim().replace(",", ".") : "";
  if (!/^-?\d+(\.\d{1,2})?$/.test(metin)) {
    ctx.addIssue({ code: "custom", message: metin && /^-?\d+\.\d{3,}$/.test(metin) ? "Tutar en fazla iki ondalık basamaklı olabilir." : seceneklar.mesaj });
    return z.NEVER;
  }
  const k = kurus(metin);
  if (k === null || Math.abs(k) > ENFAZLA_KURUS || (k < 0 && !seceneklar.negatifDahil) || (k === 0 && !seceneklar.sifirDahil)) {
    ctx.addIssue({ code: "custom", message: seceneklar.mesaj });
    return z.NEVER;
  }
  return k;
}

/** Pozitif tutar (> 0). Çıktı kuruş. */
export const pozitifTutarKurus = (mesaj = "Tutar 0'dan büyük olmalı.") =>
  z.any().transform((v, ctx) => kurusaCevir(v, ctx, { sifirDahil: false, negatifDahil: false, mesaj }));

/** Negatif olmayan tutar (>= 0), ör. iskonto. Çıktı kuruş. */
export const negatifOlmayanTutarKurus = (mesaj = "Tutar 0'dan küçük olamaz.") =>
  z.any().transform((v, ctx) => kurusaCevir(v, ctx, { sifirDahil: true, negatifDahil: false, mesaj }));

/** İşaretli, sıfır olmayan tutar (kasa dengeleme). Çıktı kuruş. */
export const sifirdanFarkliTutarKurus = (mesaj = "Dengeleme bedeli 0 olamaz.") =>
  z.any().transform((v, ctx) => kurusaCevir(v, ctx, { sifirDahil: false, negatifDahil: true, mesaj }));

/** DB'ye numeric olarak yazılacak metin ("125.50"). */
export const dbTutari = kurusMetni;

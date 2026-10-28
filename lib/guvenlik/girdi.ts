// Ortak girdi doğrulama (zod). Server action / route'ların kimlik parametreleri DB'ye gitmeden doğrulanır:
// biçimi bozuk kimlik Postgres hatası (22P02) yerine kontrollü bir hatayla durur ve hata iletisi iç ayrıntı sızdırmaz.
import { z } from "zod";

export const uuidSemasi = z.string().uuid();
export class GecersizGirdi extends Error {
  constructor(alan: string) {
    super(`Geçersiz ${alan}.`);
    this.name = "GecersizGirdi";
  }
}

/** Geçerli UUID ise aynen döner; değilse GecersizGirdi fırlatır. */
export function uuidZorunlu(deger: unknown, alan = "kimlik"): string {
  const s = uuidSemasi.safeParse(deger);
  if (!s.success) throw new GecersizGirdi(alan);
  return s.data;
}

/** Kimlik doğrulama formları: uzunluk üst sınırları (devasa gövdeyle argon2/DB zorlanmasın). Başarısızlıkta ayrıntı verilmez. */
export const girisFormuSemasi = z.strictObject({ giris_adi: z.string().min(1).max(254), sifre: z.string().min(1).max(128) });
export const portalGirisFormuSemasi = z.strictObject({ klinik_kodu: z.string().trim().min(1).max(64), telefon: z.string().min(1).max(32), sifre: z.string().min(1).max(128) });
export const sifreDegistirFormuSemasi = z.strictObject({ mevcut_sifre: z.string().min(1).max(128), yeni_sifre: z.string().min(1).max(128), yeni_sifre_tekrar: z.string().max(128) });
export const sifreSifirlaFormuSemasi = z.strictObject({ jeton: z.string().min(1).max(512), yeni_sifre: z.string().min(1).max(128), yeni_sifre_tekrar: z.string().max(128) });
export const sifremiUnuttumFormuSemasi = z.strictObject({ eposta: z.string().trim().min(1).max(254) });
export const GECERSIZ_FORM_MESAJI = "Bilgiler geçersiz. Lütfen kontrol edip tekrar deneyin.";

export function formAlanlari(formData: FormData, alanlar: readonly string[]): Record<string, string> {
  return Object.fromEntries(alanlar.map((a) => [a, typeof formData.get(a) === "string" ? (formData.get(a) as string) : ""]));
}

/** Arşiv içe aktarma parçası (istemci 200'lük parça yollar): boyut sınırları DoS'u ve devasa JSON'u keser; içerik RPC'lerde satır satır doğrulanır. */
export const arsivParcasiSemasi = z.strictObject({
  kayitlar: z.array(z.record(z.string().max(64), z.string().max(1000)).refine((o) => Object.keys(o).length <= 60, "Satırda çok fazla alan var.")).max(500),
  baslangicSatirNo: z.number().int().min(0).max(10_000_000),
});
export const telefonListesiSemasi = z.array(z.string().max(40)).max(5000);
export const mesajKanaliSemasi = z.enum(["sms", "whatsapp", "mail"]);

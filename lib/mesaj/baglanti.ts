// Bildirim bağlantıları: mesajda ad/tarih/tutar yerine gider. TEK KULLANIMLIK, SÜRELİ (72 sa), hız sınırlı (/b/[token] route'u) ve oturum AÇMAZ:
// yalnız giriş sayfasına yönlendirir; ayrıntıyı alıcı kendi hesabıyla (yetkili) görür. Veritabanında token'ın kendisi değil sha256'sı durur (bildirim_baglanti).
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { sema, type Tx } from "@/lib/db";

export const BAGLANTI_OMRU_SAAT = 72;

export function tokenHashle(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function baglantiTabani(): string {
  const taban = process.env.BETTER_AUTH_URL?.replace(/\/+$/, "");
  if (!taban) throw new Error("BETTER_AUTH_URL tanımlı değil: bildirim bağlantısı üretilemez.");
  return taban;
}

export function baglantiAdresi(token: string): string {
  return `${baglantiTabani()}/b/${token}`;
}

/** Bir alıcı için yeni bağlantı üretir (satır tenant bağlamında yazılır) ve TAM adresi döndürür. */
export async function bildirimBaglantisiUret(tx: Tx, g: { klinikId: string; aliciTipi: "personel" | "hasta"; tetikleyiciKodu: string; simdi?: Date }): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const bitis = new Date((g.simdi ?? new Date()).getTime() + BAGLANTI_OMRU_SAAT * 3_600_000);
  // Hasta bağlantısı portal giriş sayfasına gider: kliniğin QR kısa kodu oluşturulurken kopyalanır (çözümlemede tenant bağlamı olmayacak).
  const kisaKod = g.aliciTipi === "hasta" ? (await tx.select({ k: sema.klinik.qrKisaKod }).from(sema.klinik).where(eq(sema.klinik.id, g.klinikId)).limit(1))[0]?.k ?? null : null;
  await tx.insert(sema.bildirimBaglanti).values({ klinikId: g.klinikId, tokenHash: tokenHashle(token), aliciTipi: g.aliciTipi, tetikleyiciKodu: g.tetikleyiciKodu, klinikKisaKod: kisaKod, sonKullanma: bitis.toISOString() });
  return baglantiAdresi(token);
}

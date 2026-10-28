// Şifre sıfırlama e-postası. KVKK kuralı (docs/kvkk-aktarim.md): e-posta gövdesinde KİŞİSEL/SAĞLIK VERİSİ OLMAZ, yalnız bağlantı odaklı metin.
// Gönderici enjekte edilebilir (testler); varsayılan Resend'dir (RESEND_API_KEY + RESEND_GONDEREN). Yapılandırma yoksa gönderim açık hatayla düşer.
export type EpostaGonderici = (e: { alici: string; konu: string; metin: string }) => Promise<void>;

/** Sabit, veri içermeyen konu ve gövde. `baglanti` dışında hiçbir kullanıcı/klinik bilgisi içermez. */
export function sifirlamaEpostasiIcerigi(baglanti: string): { konu: string; metin: string } {
  return {
    konu: EPOSTA_KONUSU,
    metin: `Şifre sıfırlama isteği alındı. Bağlantı 30 dakika geçerlidir ve yalnız bir kez kullanılabilir: ${baglanti}\nBu isteği siz yapmadıysanız bu iletiyi yok sayın.`,
  };
}

import { EPOSTA_KONUSU } from "@/lib/mesaj/icerik";
import { EpostaYapilandirilmadi, resendIleGonder } from "@/lib/mesaj/eposta-resend";
import { randomUUID } from "node:crypto";

// Varsayılan gönderici: Resend (lib/mesaj/eposta-resend.ts). Yapılandırma yoksa SESSİZCE geçmez: EpostaYapilandirilmadi fırlatır (çağıran günlüğe yazar).
let gonderici: EpostaGonderici = async (e) => {
  const s = await resendIleGonder({ alici: e.alici, konu: e.konu, metin: e.metin, idempotencyKey: `auth:${randomUUID()}` });
  if (!s.ok) throw s.hata.startsWith("E-posta göndericisi") ? new EpostaYapilandirilmadi() : new Error(s.hata);
};

export function epostaGondericiAyarla(g: EpostaGonderici): void {
  gonderici = g;
}

export async function epostaGonder(e: { alici: string; konu: string; metin: string }): Promise<void> {
  await gonderici(e);
}

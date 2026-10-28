// E-posta çıkış ucu: Resend (EU). Env: RESEND_API_KEY, RESEND_GONDEREN (ör. "Klinik Bildirim <bildirim@alanadi.com>"). İsteğe bağlı RESEND_API_ADRESI (test/vekil).
// KVKK: konu SABİT ve veri içermez (EPOSTA_KONUSU); gövde yalnız lib/mesaj/icerik.ts kuralına uyan metindir; ek YOK; HTML YOK (yalnız düz metin).
// Yinelenen gönderim koruması: `Idempotency-Key` başlığı (Resend aynı anahtarla ikinci isteği yeni e-posta yapmaz) = kuyruk satırının idempotency anahtarı.
// Yapılandırma yoksa sessizce "gönderilmiş" SAYILMAZ: açık hata döner (kuyruk satırı 'hata' olur / şifre sıfırlama günlüğe yazar).
export type EpostaSonucu = { ok: true; saglayiciId: string } | { ok: false; kalici: boolean; hata: string };

export class EpostaYapilandirilmadi extends Error {
  constructor() {
    super("E-posta göndericisi yapılandırılmadı (RESEND_API_KEY / RESEND_GONDEREN).");
    this.name = "EpostaYapilandirilmadi";
  }
}

export function resendYapilandirildiMi(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_GONDEREN);
}

const ADRES_KALIBI = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,255}$/;

export async function resendIleGonder(e: { alici: string; konu: string; metin: string; idempotencyKey: string }): Promise<EpostaSonucu> {
  if (!resendYapilandirildiMi()) return { ok: false, kalici: false, hata: new EpostaYapilandirilmadi().message };
  if (!ADRES_KALIBI.test(e.alici)) return { ok: false, kalici: true, hata: "alıcı adresi geçersiz" };

  try {
    const yanit = await fetch(`${process.env.RESEND_API_ADRESI ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": e.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: process.env.RESEND_GONDEREN, to: [e.alici], subject: e.konu, text: e.metin }),
      signal: AbortSignal.timeout(15_000),
    });
    if (yanit.ok) {
      const govde = (await yanit.json().catch(() => ({}))) as { id?: string };
      return { ok: true, saglayiciId: govde.id ?? "" };
    }
    // Gövde (alıcı adresi içerebilir) loga/kuyruğa YAZILMAZ; yalnız durum kodu.
    const kalici = yanit.status >= 400 && yanit.status < 500 && yanit.status !== 429 && yanit.status !== 408;
    return { ok: false, kalici, hata: `Resend HTTP ${yanit.status}` };
  } catch (hata) {
    return { ok: false, kalici: false, hata: hata instanceof Error && hata.name === "TimeoutError" ? "Resend zaman aşımı" : "Resend'e ulaşılamadı" };
  }
}

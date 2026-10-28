// GERÇEK Resend gönderimi (test ortamı anahtarıyla). Yalnız anahtar verilirse çalışır; aksi halde ATLANIR (CI'da gizli değer yoktur):
//   RESEND_TEST_API_KEY=re_...  npx vitest run lib/mesaj/eposta-resend.entegrasyon.test.ts
// İsteğe bağlı RESEND_TEST_GONDEREN (Resend'de doğrulanmış alan adı); verilmezse Resend'in ortak test göndericisi `onboarding@resend.dev` kullanılır.
// Alıcı `delivered@resend.dev`: Resend'in test adresidir, gerçek kimseye ulaşmaz ve "teslim edildi" durumuna döner.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resendIleGonder } from "./eposta-resend";
import { sifirlamaEpostasiIcerigi } from "@/lib/auth/eposta";

const anahtar = process.env.RESEND_TEST_API_KEY;

describe.skipIf(!anahtar)("Resend gerçek gönderim (test ortamı)", () => {
  const eski = { k: process.env.RESEND_API_KEY, g: process.env.RESEND_GONDEREN };
  beforeAll(() => {
    process.env.RESEND_API_KEY = anahtar;
    process.env.RESEND_GONDEREN = process.env.RESEND_TEST_GONDEREN ?? "Klinik Test <onboarding@resend.dev>";
  });
  afterAll(() => {
    if (eski.k === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = eski.k;
    if (eski.g === undefined) delete process.env.RESEND_GONDEREN;
    else process.env.RESEND_GONDEREN = eski.g;
  });

  it("şifre sıfırlama içeriği test adresine gerçekten gönderilir ve sağlayıcı kimliği döner; aynı Idempotency-Key ikinci e-posta üretmez", async () => {
    const i = sifirlamaEpostasiIcerigi("https://klinik.test/sifre-sifirla?token=entegrasyon-denemesi");
    const key = `entegrasyon:${Date.now()}`;
    const ilk = await resendIleGonder({ alici: "delivered@resend.dev", ...i, idempotencyKey: key });
    expect(ilk.ok, JSON.stringify(ilk)).toBe(true);
    if (!ilk.ok) return;
    expect(ilk.saglayiciId).toMatch(/\S+/);
    const tekrar = await resendIleGonder({ alici: "delivered@resend.dev", ...i, idempotencyKey: key });
    expect(tekrar.ok, JSON.stringify(tekrar)).toBe(true);
    if (tekrar.ok) expect(tekrar.saglayiciId).toBe(ilk.saglayiciId);
  }, 30_000);

  it("geçersiz anahtar kalıcı hata olarak bildirilir (gönderim 'başarılı' sayılmaz)", async () => {
    process.env.RESEND_API_KEY = "re_gecersiz_anahtar";
    const s = await resendIleGonder({ alici: "delivered@resend.dev", konu: "Klinik bildirimi", metin: "deneme", idempotencyKey: `gecersiz:${Date.now()}` });
    process.env.RESEND_API_KEY = anahtar;
    expect(s.ok).toBe(false);
  }, 30_000);
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EpostaYapilandirilmadi, resendIleGonder, resendYapilandirildiMi } from "./eposta-resend";
import { epostaGonder, sifirlamaEpostasiIcerigi } from "@/lib/auth/eposta";
import { EPOSTA_KONUSU } from "./icerik";

const G = { alici: "kisi@deneme.test", konu: EPOSTA_KONUSU, metin: "Merhaba https://x.test/b/abc", idempotencyKey: "anahtar-1" };

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_GONDEREN = "Klinik <bildirim@deneme.test>";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_GONDEREN;
  delete process.env.RESEND_API_ADRESI;
});

describe("resendIleGonder", () => {
  it("doğru istek: yetki başlığı, Idempotency-Key, yalnız düz metin (HTML/ek yok), sabit gönderen", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(await resendIleGonder(G)).toEqual({ ok: true, saglayiciId: "re_1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const basliklar = init.headers as Record<string, string>;
    expect(basliklar.Authorization).toBe("Bearer re_test");
    expect(basliklar["Idempotency-Key"]).toBe("anahtar-1");
    expect(JSON.parse(init.body as string)).toEqual({ from: "Klinik <bildirim@deneme.test>", to: ["kisi@deneme.test"], subject: "Klinik bildirimi", text: G.metin });
  });

  it("yapılandırma yoksa sessiz geçmez: açık hata, ağ çağrısı yok", async () => {
    delete process.env.RESEND_API_KEY;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(resendYapilandirildiMi()).toBe(false);
    expect(await resendIleGonder(G)).toMatchObject({ ok: false, kalici: false });
    expect(f).not.toHaveBeenCalled();
  });

  it("geçersiz alıcı kalıcı hata (ağa çıkmaz); 4xx kalıcı, 429/5xx/zaman aşımı geçici; hata iletisinde alıcı adresi/gövde yok", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const kotu of ["", "a@", "<x>@y.test", "a b@c.test", "x@y.test\r\nBcc: z@w.test"]) expect(await resendIleGonder({ ...G, alici: kotu }), kotu).toMatchObject({ ok: false, kalici: true });
    expect(f).not.toHaveBeenCalled();
    f.mockResolvedValueOnce(new Response('{"message":"kisi@deneme.test geçersiz"}', { status: 422 }));
    const k = await resendIleGonder(G);
    expect(k).toEqual({ ok: false, kalici: true, hata: "Resend HTTP 422" });
    f.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    expect(await resendIleGonder(G)).toMatchObject({ ok: false, kalici: false });
    f.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    expect(await resendIleGonder(G)).toMatchObject({ ok: false, kalici: false });
    f.mockRejectedValueOnce(Object.assign(new Error("t"), { name: "TimeoutError" }));
    expect(await resendIleGonder(G)).toEqual({ ok: false, kalici: false, hata: "Resend zaman aşımı" });
    f.mockRejectedValueOnce(new Error("ECONNREFUSED kisi@deneme.test"));
    expect(JSON.stringify(await resendIleGonder(G))).not.toContain("kisi@");
  });
});

describe("şifre sıfırlama e-postası (lib/auth/eposta.ts)", () => {
  it("içerik: sabit konu, yalnız bağlantı odaklı metin; kişisel veri yok", () => {
    const i = sifirlamaEpostasiIcerigi("https://klinik.test/sifre-sifirla?token=abc");
    expect(i.konu).toBe(EPOSTA_KONUSU);
    expect(i.metin).toContain("https://klinik.test/sifre-sifirla?token=abc");
    expect(i.metin).not.toMatch(/@/);
  });

  it("varsayılan gönderici Resend'dir: gerçekten e-posta atar; yapılandırma yoksa EpostaYapilandirilmadi fırlatır (sessizce geçmez)", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "re_9" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await epostaGonder({ alici: "yonetici@deneme.test", ...sifirlamaEpostasiIcerigi("https://k.test/s?t=1") });
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).to).toEqual(["yonetici@deneme.test"]);
    // Yapılandırma yoksa SESSİZCE geçmez
    delete process.env.RESEND_API_KEY;
    await expect(epostaGonder({ alici: "yonetici@deneme.test", ...sifirlamaEpostasiIcerigi("https://k.test/s?t=1") })).rejects.toBeInstanceOf(EpostaYapilandirilmadi);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

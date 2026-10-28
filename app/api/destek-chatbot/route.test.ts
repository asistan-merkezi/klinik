// Destek chatbotu: özellik bayrağı kapalıyken LLM'e HİÇ veri gitmez; açıkken yalnız personel oturumu kabul edilir ve modele giden metin maskelidir.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamText = vi.fn(() => ({ toUIMessageStreamResponse: () => new Response("akis") }));
const convertToModelMessages = vi.fn(async (m: unknown) => m);
vi.mock("ai", () => ({ streamText: (...a: unknown[]) => (streamText as unknown as (...x: unknown[]) => unknown)(...a), convertToModelMessages: (m: unknown) => convertToModelMessages(m) }));

const oturumBaglami = vi.fn();
vi.mock("@/lib/auth/gecerli-kullanici", () => ({ oturumBaglami: () => oturumBaglami() }));

// Hız sınırı DB sayacı kullanır (tests/db/guvenlik-baseline.test.ts gerçek sayaçla sınar); bu birim testte izin verilir.
vi.mock("@/lib/guvenlik/istek-siniri", () => ({ sinirYaniti: async () => null }));

import { POST } from "./route";

const personel = { tur: "personel", tenantId: "k1", rol: "resepsiyon", userId: "u1" };
const istek = (metin = "merhaba") =>
  new Request("http://x/api/destek-chatbot", { method: "POST", body: JSON.stringify({ messages: [{ id: "1", role: "user", parts: [{ type: "text", text: metin }] }] }) });

beforeEach(() => {
  streamText.mockClear();
  convertToModelMessages.mockClear();
  oturumBaglami.mockReset();
  oturumBaglami.mockResolvedValue(personel);
});
afterEach(() => vi.unstubAllEnvs());

describe("özellik bayrağı KAPALI", () => {
  for (const deger of ["", "0", "false", "hayir", " "]) {
    it(`DESTEK_CHATBOT_ACIK=${JSON.stringify(deger)} → 404, oturum okunmaz, model ÇAĞRILMAZ`, async () => {
      vi.stubEnv("DESTEK_CHATBOT_ACIK", deger);
      const r = await POST(istek("TC 12345678901, IBAN TR330006100519786457841326"));
      expect(r.status).toBe(404);
      expect(streamText).not.toHaveBeenCalled();
      expect(convertToModelMessages).not.toHaveBeenCalled();
      expect(oturumBaglami).not.toHaveBeenCalled();
    });
  }
});

describe("özellik bayrağı AÇIK", () => {
  beforeEach(() => vi.stubEnv("DESTEK_CHATBOT_ACIK", "true"));

  it("oturum yok → 401; hasta → 403; klinik bağlamı olmayan super_admin → 403; model çağrılmaz", async () => {
    oturumBaglami.mockResolvedValueOnce(null);
    expect((await POST(istek())).status).toBe(401);
    oturumBaglami.mockResolvedValueOnce({ ...personel, tur: "hasta" });
    expect((await POST(istek())).status).toBe(403);
    oturumBaglami.mockResolvedValueOnce({ ...personel, rol: "super_admin", tenantId: null });
    expect((await POST(istek())).status).toBe(403);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("geçersiz / aşırı büyük gövde reddedilir", async () => {
    expect((await POST(new Request("http://x", { method: "POST", body: "{bozuk" }))).status).toBe(400);
    expect((await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ messages: [] }) }))).status).toBe(400);
    expect((await POST(new Request("http://x", { method: "POST", body: "x".repeat(100_001) }))).status).toBe(413);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("personel: model çağrılır ve modele giden metinde TC/IBAN/telefon/e-posta/kart YOKTUR", async () => {
    const r = await POST(istek("Hasta TC 12345678901, IBAN TR33 0006 1005 1978 6457 8413 26, tel 0532 111 22 33, a.b@ornek.com, kart 4111 1111 1111 1111 nasıl ödeme eklerim?"));
    expect(r.status).toBe(200);
    expect(streamText).toHaveBeenCalledTimes(1);
    const gonderilen = JSON.stringify(convertToModelMessages.mock.calls[0][0]);
    for (const ham of ["12345678901", "TR33", "0532", "a.b@ornek.com", "4111"]) expect(gonderilen).not.toContain(ham);
    for (const etiket of ["[TC]", "[IBAN]", "[TELEFON]", "[E-POSTA]", "[KART/NUMARA]"]) expect(gonderilen).toContain(etiket);
    expect(gonderilen).toContain("nasıl ödeme eklerim?");
  });

  it("metin dışı parçalar (dosya vb.) modele GİTMEZ", async () => {
    const govde = { messages: [{ id: "1", role: "user", parts: [{ type: "file", url: "data:image/png;base64,AAAA" }, { type: "text", text: "selam" }] }] };
    await POST(new Request("http://x", { method: "POST", body: JSON.stringify(govde) }));
    const gonderilen = JSON.stringify(convertToModelMessages.mock.calls[0][0]);
    expect(gonderilen).not.toContain("base64");
    expect(gonderilen).toContain("selam");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { GizliAnahtarYok, gizliCoz, gizliSifrele, sifreliMi } from "./gizli-sifrele";

const eski = process.env.GIZLI_VERI_ANAHTARI;
beforeEach(() => {
  process.env.GIZLI_VERI_ANAHTARI = randomBytes(32).toString("base64");
});
afterEach(() => {
  if (eski === undefined) delete process.env.GIZLI_VERI_ANAHTARI;
  else process.env.GIZLI_VERI_ANAHTARI = eski;
});

describe("gizli veri şifreleme (AES-256-GCM)", () => {
  it("gidiş-dönüş; her şifreleme farklı (rastgele IV); düz değer çıktıda yok", () => {
    const a = gizliSifrele("çok-gizli-anahtar", "klinik-1");
    const b = gizliSifrele("çok-gizli-anahtar", "klinik-1");
    expect(a).not.toBe(b);
    expect(a).not.toContain("çok-gizli-anahtar");
    expect(sifreliMi(a)).toBe(true);
    expect(gizliCoz(a, "klinik-1")).toBe("çok-gizli-anahtar");
  });

  it("başka kliniğin bağlamıyla (AAD) çözülemez; değiştirilmiş veri çözülemez", () => {
    const a = gizliSifrele("s", "klinik-1");
    expect(() => gizliCoz(a, "klinik-2")).toThrow();
    const parcalar = a.split(":");
    parcalar[4] = Buffer.from("xx").toString("base64url");
    expect(() => gizliCoz(parcalar.join(":"), "klinik-1")).toThrow();
  });

  it("anahtar yoksa / 32 bayt değilse sessizce düz yazmaz, fırlatır", () => {
    delete process.env.GIZLI_VERI_ANAHTARI;
    expect(() => gizliSifrele("s", "k")).toThrow(GizliAnahtarYok);
    process.env.GIZLI_VERI_ANAHTARI = Buffer.from("kisa").toString("base64");
    expect(() => gizliSifrele("s", "k")).toThrow(GizliAnahtarYok);
  });

  it("düz metin şifreli sayılmaz", () => {
    expect(sifreliMi("düz")).toBe(false);
    expect(sifreliMi(null)).toBe(false);
  });
});

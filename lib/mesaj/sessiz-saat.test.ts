import { describe, expect, it } from "vitest";
import { VARSAYILAN_SESSIZ_SAAT, gonderimZamani, sessizSaatAyariCoz, sessizSaatteMi } from "./sessiz-saat";

// İstanbul = UTC+3 (sabit). 21:00 İstanbul = 18:00Z, 08:00 İstanbul = 05:00Z.
const A = VARSAYILAN_SESSIZ_SAAT;
const z = (s: string) => new Date(s);

describe("sessizSaatteMi (21:00-08:00)", () => {
  it("gündüz serbest", () => {
    expect(sessizSaatteMi(z("2026-10-12T09:00:00Z"), A)).toBe(false); // 12:00
    expect(sessizSaatteMi(z("2026-10-12T05:00:00Z"), A)).toBe(false); // 08:00 tam bitiş: serbest
    expect(sessizSaatteMi(z("2026-10-12T17:59:00Z"), A)).toBe(false); // 20:59
  });
  it("gece sessiz (gece yarısını aşan aralık)", () => {
    expect(sessizSaatteMi(z("2026-10-12T18:00:00Z"), A)).toBe(true); // 21:00
    expect(sessizSaatteMi(z("2026-10-12T21:30:00Z"), A)).toBe(true); // 00:30
    expect(sessizSaatteMi(z("2026-10-13T04:59:00Z"), A)).toBe(true); // 07:59
  });
  it("gece yarısını aşmayan aralık", () => {
    const ogle = { baslangic: "12:00", bitis: "14:00" };
    expect(sessizSaatteMi(z("2026-10-12T09:30:00Z"), ogle)).toBe(true); // 12:30
    expect(sessizSaatteMi(z("2026-10-12T11:00:00Z"), ogle)).toBe(false); // 14:00
  });
});

describe("gonderimZamani", () => {
  it("sessiz değilse aynı an", () => {
    const an = z("2026-10-12T09:00:00Z");
    expect(gonderimZamani(an, A)).toBe(an);
  });
  it("21:00 sonrası → ertesi gün 08:00 İstanbul", () => {
    expect(gonderimZamani(z("2026-10-12T19:00:00Z"), A).toISOString()).toBe("2026-10-13T05:00:00.000Z");
  });
  it("00:30 → aynı günün 08:00'ı", () => {
    expect(gonderimZamani(z("2026-10-12T21:30:00Z"), A).toISOString()).toBe("2026-10-13T05:00:00.000Z");
  });
  it("ay sonu geçişi", () => {
    expect(gonderimZamani(z("2026-10-31T19:00:00Z"), A).toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });
  it("kapalı ayar (null) hep aynı an", () => {
    const an = z("2026-10-12T21:30:00Z");
    expect(gonderimZamani(an, null)).toBe(an);
  });
});

describe("sessizSaatAyariCoz", () => {
  it("ayar yoksa/bozuksa varsayılan", () => {
    expect(sessizSaatAyariCoz(undefined)).toEqual(A);
    expect(sessizSaatAyariCoz({ baslangic: "25:00", bitis: "08:00" })).toEqual(A);
    expect(sessizSaatAyariCoz({ baslangic: "21:00", bitis: "21:00" })).toEqual(A);
  });
  it("kapalı → null, geçerli özel aralık korunur", () => {
    expect(sessizSaatAyariCoz({ kapali: true })).toBeNull();
    expect(sessizSaatAyariCoz({ baslangic: "22:30", bitis: "07:00" })).toEqual({ baslangic: "22:30", bitis: "07:00" });
  });
});

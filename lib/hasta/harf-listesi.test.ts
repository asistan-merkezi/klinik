import { describe, expect, it } from "vitest";
import { DIGER, harfAnahtari, harfParametresiCoz, harfSayilariniTopla, sayfaParametresiCoz } from "./harf-listesi";

describe("harfAnahtari", () => {
  it("Türkçe büyük-küçük harf eşlemesi (DB turkce_kucuk_harf ile aynı)", () => {
    expect(harfAnahtari("I")).toBe("ı");
    expect(harfAnahtari("İ")).toBe("i");
    expect(harfAnahtari("Ç")).toBe("ç");
    expect(harfAnahtari("Ş")).toBe("ş");
  });
});

describe("harfParametresiCoz", () => {
  it("yalnız alfabe harflerini ve 'diger'i kabul eder", () => {
    expect(harfParametresiCoz("Ş")).toBe("Ş");
    expect(harfParametresiCoz(DIGER)).toBe(DIGER);
    expect(harfParametresiCoz("Q")).toBeNull();
    expect(harfParametresiCoz("a")).toBeNull();
    expect(harfParametresiCoz(undefined)).toBeNull();
  });
});

describe("sayfaParametresiCoz", () => {
  it("1..toplam sayfa aralığına sıkıştırır", () => {
    expect(sayfaParametresiCoz(undefined, 120)).toBe(1);
    expect(sayfaParametresiCoz("3", 120)).toBe(3);
    expect(sayfaParametresiCoz("9", 120)).toBe(3);
    expect(sayfaParametresiCoz("0", 120)).toBe(1);
    expect(sayfaParametresiCoz("abc", 0)).toBe(1);
  });
});

describe("harfSayilariniTopla", () => {
  it("harfleri eşler, alfabe dışını 'diger'de toplar", () => {
    const { sayilar, toplam } = harfSayilariniTopla([
      { harf: "a", adet: 5 },
      { harf: "ı", adet: 2 },
      { harf: "i", adet: 3 },
      { harf: "ş", adet: 1 },
      { harf: "w", adet: 1 },
      { harf: "4", adet: 1 },
    ]);
    expect(toplam).toBe(13);
    expect(sayilar.get("A")).toBe(5);
    expect(sayilar.get("I")).toBe(2);
    expect(sayilar.get("İ")).toBe(3);
    expect(sayilar.get("Ş")).toBe(1);
    expect(sayilar.get(DIGER)).toBe(2);
  });
});

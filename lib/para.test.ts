import { describe, expect, it } from "vitest";
import { kdvAyristir, kurus, kurusGoster, kurusMetni, netTutar, oranYuzluk, topla, yuzdeDus, yuzdeKurus } from "./para";

describe("kuruş dönüşümü", () => {
  it("metin/sayı → kuruş, float hatası yok", () => {
    expect(kurus("125.5")).toBe(12550);
    expect(kurus("0.1")).toBe(10);
    expect(kurus(0.1 + 0.2)).toBe(30); // float 0.30000000000000004
    expect(kurus("1.005")).toBe(101); // yarım yukarı (float'ta 1.00 çıkardı)
    expect(kurus("-2.345")).toBe(-235);
    expect(kurus("100")).toBe(10000);
  });
  it("geçersiz girdi null", () => {
    for (const g of ["", " ", "abc", "1,5", "1e3", "--1", null, undefined, NaN, Infinity]) expect(kurus(g as never), String(g)).toBeNull();
  });
  it("kuruş → metin gidiş-dönüş", () => {
    expect(kurusMetni(12550)).toBe("125.50");
    expect(kurusMetni(5)).toBe("0.05");
    expect(kurusMetni(-1999)).toBe("-19.99");
    expect(kurusGoster(12550)).toBe("125,50");
    expect(kurus(kurusMetni(123456789))).toBe(123456789);
  });
  it("toplama tam", () => {
    expect(topla([10, 20, 30].map((x) => kurus(`0.${x}`)!))).toBe(60);
    expect(kurusMetni(topla(Array(10).fill(kurus("0.10")!)))).toBe("1.00");
  });
});

describe("yüzde / komisyon", () => {
  it("komisyon yarım yukarı", () => {
    expect(oranYuzluk("2.5")).toBe(250);
    expect(yuzdeKurus(10000, "2.5")).toBe(250); // 100₺ × %2,5 = 2,50₺
    expect(yuzdeKurus(10001, "2.5")).toBe(250); // 2.50025 → 2.50
    expect(yuzdeKurus(1, "50")).toBe(1); // 0.5 kuruş → 1 (yukarı)
    expect(yuzdeDus(12345, "3.5")).toBe(12345 - 432); // 432.075 → 432
  });
  it("geçersiz oran fırlatır", () => {
    expect(() => oranYuzluk("x")).toThrow();
    expect(() => oranYuzluk("-1")).toThrow();
  });
});

describe("KDV ayrıştırma (KDV dahil toplamdan)", () => {
  it("%20: 120₺ → matrah 100, KDV 20", () => {
    expect(kdvAyristir(12000, "20")).toEqual({ matrah: 10000, kdvTutari: 2000 });
  });
  it("matrah + KDV = toplam her zaman; yuvarlama matrahta", () => {
    for (const t of [1, 99, 1000, 12345, 99999]) for (const o of ["1", "10", "20"]) {
      const r = kdvAyristir(t, o);
      expect(r.matrah + r.kdvTutari).toBe(t);
    }
    expect(kdvAyristir(10000, "20")).toEqual({ matrah: 8333, kdvTutari: 1667 }); // 83.333 → 83.33
  });
  it("oran 0/boş: KDV yok", () => {
    expect(kdvAyristir(5000, "0")).toEqual({ matrah: 5000, kdvTutari: 0 });
    expect(kdvAyristir(5000, null)).toEqual({ matrah: 5000, kdvTutari: 0 });
  });
});

describe("net tutar", () => {
  it("iskonto brütü aşarsa 0", () => {
    expect(netTutar(10000, 2500)).toBe(7500);
    expect(netTutar(1000, 2000)).toBe(0);
  });
});

describe("TL yardımcıları", () => {
  it("tl / tlTopla / tlFark float hatasız", async () => {
    const { tl, tlTopla, tlFark } = await import("./para");
    expect(tl("125.50")).toBe(125.5);
    expect(tl(null)).toBe(0);
    expect(tlTopla([0.1, 0.2])).toBe(0.3);
    expect(tlTopla(Array(100).fill(0.1))).toBe(10);
    expect(tlFark(0.3, 0.1)).toBe(0.2);
  });
});

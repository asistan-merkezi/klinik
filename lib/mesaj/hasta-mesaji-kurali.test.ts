import { describe, expect, it } from "vitest";
import {
  hosgeldinAnahtari,
  odemeAlindiAnahtari,
  paketSatisOzetiAnahtari,
  paketSatisTazeMi,
  tutarMetni,
} from "./hasta-mesaji-kurali";

describe("paket satış özeti", () => {
  const simdi = new Date("2026-10-12T10:00:00.000Z");
  it("anahtar satış başına", () => {
    expect(paketSatisOzetiAnahtari("s1")).toBe("hasta_paket_satis_ozet:s1");
  });
  it("yalnız son 2 dakikada oluşan satış taze sayılır", () => {
    expect(paketSatisTazeMi("2026-10-12T09:59:00.000Z", simdi)).toBe(true);
    expect(paketSatisTazeMi("2026-10-12T09:50:00.000Z", simdi)).toBe(false);
    expect(paketSatisTazeMi("2026-09-01T09:59:00.000Z", simdi)).toBe(false);
  });
});

describe("tutarMetni", () => {
  it("Türkçe para biçimi", () => {
    expect(tutarMetni(500)).toMatch(/^₺\s?500,00$/);
    expect(tutarMetni(1250.5)).toMatch(/^₺\s?1\.250,50$/);
  });
});

describe("anahtarlar", () => {
  it("hoş geldin hasta başına tek", () => {
    expect(hosgeldinAnahtari("h1")).toBe("hasta_kayit_hosgeldin:h1");
  });
  it("ödeme alındı: hareket ve randevu kaynakları ayrı uzaylarda", () => {
    expect(odemeAlindiAnahtari({ hareketId: "x" })).not.toBe(odemeAlindiAnahtari({ randevuId: "x" }));
    expect(odemeAlindiAnahtari({ hareketId: "x" })).toBe(odemeAlindiAnahtari({ hareketId: "x" }));
  });
});

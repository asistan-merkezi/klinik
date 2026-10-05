import { describe, expect, it } from "vitest";
import { anMs, saatAdaylari, saatMusaitMi, type MesgulAraliklar } from "./musait-saatler";

const TARIH = "2030-03-12";
const bos: MesgulAraliklar = { kaynak: [], cihaz: [] };

describe("saatAdaylari", () => {
  it("08:00-19:30 arası 30 dk'lık ızgara üretir, ızgara dışı ekstra saati sıralı katar", () => {
    const adaylar = saatAdaylari("09:15");
    expect(adaylar[0]).toBe("08:00");
    expect(adaylar.at(-1)).toBe("19:30");
    expect(adaylar).toContain("09:15");
    expect(adaylar.indexOf("09:15")).toBe(adaylar.indexOf("09:00") + 1);
  });
});

describe("saatMusaitMi", () => {
  it("terapist/oda dolu aralığıyla çakışan saati eler, bitişikteki saati kabul eder", () => {
    const mesgul: MesgulAraliklar = {
      kaynak: [{ bas: anMs(TARIH, "10:00"), bit: anMs(TARIH, "11:00") }],
      cihaz: [],
    };
    expect(saatMusaitMi(TARIH, "09:30", 45, [], mesgul)).toBe(false);
    expect(saatMusaitMi(TARIH, "09:00", 60, [], mesgul)).toBe(true);
    expect(saatMusaitMi(TARIH, "11:00", 60, [], mesgul)).toBe(true);
  });

  it("seans gün sonunu (20:00) aşarsa eler", () => {
    expect(saatMusaitMi(TARIH, "19:30", 30, [], bos)).toBe(true);
    expect(saatMusaitMi(TARIH, "19:30", 45, [], bos)).toBe(false);
  });

  it("cihaz yalnız kendi adımının penceresinde dolu sayılır", () => {
    // Tedavi: 20 dk cihazsız + 20 dk cihaz A → 10:00'da başlarsa A 10:20-10:40 kullanılır.
    const adimlar = [
      { sure_dakika: 20, cihaz_id: null },
      { sure_dakika: 20, cihaz_id: "A" },
    ];
    const mesgul: MesgulAraliklar = {
      kaynak: [],
      cihaz: [{ cihazId: "A", bas: anMs(TARIH, "10:00"), bit: anMs(TARIH, "10:20") }],
    };
    expect(saatMusaitMi(TARIH, "10:00", 40, adimlar, mesgul)).toBe(true);
    expect(saatMusaitMi(TARIH, "09:50", 40, adimlar, mesgul)).toBe(false);
    expect(saatMusaitMi(TARIH, "10:00", 40, adimlar, { kaynak: [], cihaz: [{ ...mesgul.cihaz[0], cihazId: "B" }] })).toBe(true);
  });
});

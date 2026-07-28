import { describe, expect, it } from "vitest";
import { ayAraligi, gunAraligi, haftaAraligi } from "./utils";

describe("gunAraligi — İstanbul gün sınırı", () => {
  it("gece yarısına yakın (İstanbul 00:15) bir anı doğru güne bağlar", () => {
    // 2026-07-28T00:15 İstanbul == 2026-07-27T21:15Z
    const { baslangic, bitis } = gunAraligi(new Date("2026-07-27T21:15:00.000Z"));
    expect(baslangic).toBe("2026-07-27T21:00:00.000Z"); // 28'i 00:00 İstanbul
    expect(bitis).toBe("2026-07-28T21:00:00.000Z"); // 29'u 00:00 İstanbul
  });

  it("gün sonuna yakın (İstanbul 23:30) bir anı doğru güne bağlar", () => {
    // 2026-07-28T23:30 İstanbul == 2026-07-28T20:30Z
    const { baslangic, bitis } = gunAraligi(new Date("2026-07-28T20:30:00.000Z"));
    expect(baslangic).toBe("2026-07-27T21:00:00.000Z");
    expect(bitis).toBe("2026-07-28T21:00:00.000Z");
  });
});

describe("haftaAraligi — İstanbul takvim haftası (Pazartesi-Pazar)", () => {
  it("hafta ortasındaki bir gün için Pazartesi 00:00 İstanbul'dan başlar", () => {
    // 2026-07-28 Salı, İstanbul öğleden sonra
    const { baslangic, bitis } = haftaAraligi(new Date("2026-07-28T11:30:00.000Z"));
    expect(baslangic).toBe("2026-07-26T21:00:00.000Z"); // Pazartesi 27'si 00:00 İstanbul
    expect(bitis).toBe("2026-08-02T21:00:00.000Z"); // sonraki Pazartesi 00:00 İstanbul
  });
});

describe("ayAraligi — İstanbul takvim ayı", () => {
  it("verilen ay parametresi için ayın 1'i 00:00 İstanbul'dan başlar", () => {
    const sonuc = ayAraligi("2026-07");
    expect(sonuc.baslangic).toBe("2026-06-30T21:00:00.000Z"); // 1 Temmuz 00:00 İstanbul
    expect(sonuc.bitis).toBe("2026-07-31T21:00:00.000Z"); // 1 Ağustos 00:00 İstanbul
    expect(sonuc.baslangicTarih).toBe("2026-07-01");
    expect(sonuc.bitisTarih).toBe("2026-08-01");
    expect(sonuc.etiket).toBe("Temmuz 2026");
    expect(sonuc.oncekiParam).toBe("2026-06");
    expect(sonuc.sonrakiParam).toBe("2026-08");
  });

  it("yıl sınırında (Aralık -> Ocak) doğru sarar", () => {
    const sonuc = ayAraligi("2026-12");
    expect(sonuc.oncekiParam).toBe("2026-11");
    expect(sonuc.sonrakiParam).toBe("2027-01");
  });
});

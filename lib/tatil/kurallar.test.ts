import { describe, expect, it } from "vitest";
import { bayramDurumu, kontrolEdilecekYillar, nagerBayramlariniAyikla, sabitTatiller, tatilAdiBayrami } from "./kurallar";

describe("sabitTatiller", () => {
  it("7 sabit tatili verilen yılla üretir", () => {
    const t = sabitTatiller(2028);
    expect(t).toHaveLength(7);
    expect(t[0]).toEqual({ tarih: "2028-01-01", ad: "Yılbaşı" });
    expect(t.map((x) => x.tarih)).toContain("2028-10-29");
  });
});

describe("nagerBayramlariniAyikla", () => {
  // Nager.Date 2027/TR yanıtının bir kısmı (gerçek veri, 2026-10-12).
  const yanit = [
    { date: "2027-01-01", localName: "Yılbaşı" },
    { date: "2027-03-12", localName: "Ramazan Bayramı 3. Gün (Tentative Date)" },
    { date: "2027-03-10", localName: "Ramazan Bayramı 1. Gün (Tentative Date)" },
    { date: "2027-03-11", localName: "Ramazan Bayramı 2. Gün (Tentative Date)" },
    { date: "2027-05-19", localName: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
    { date: "2027-05-16", localName: "Kurban Bayramı 1. Gün (Tentative Date)" },
    { date: "2027-05-19", localName: "Kurban Bayramı 4. Gün (Tentative Date)" },
  ];

  it("yalnız dini bayramları alır ve gün numarasını sıradan verir", () => {
    const s = nagerBayramlariniAyikla(yanit, 2027);
    expect(s.filter((o) => o.bayram === "ramazan").map((o) => [o.tarih, o.ad])).toEqual([
      ["2027-03-10", "Ramazan Bayramı (1. gün)"],
      ["2027-03-11", "Ramazan Bayramı (2. gün)"],
      ["2027-03-12", "Ramazan Bayramı (3. gün)"],
    ]);
    expect(s.filter((o) => o.bayram === "kurban").map((o) => o.ad)).toEqual([
      "Kurban Bayramı (1. gün)",
      "Kurban Bayramı (2. gün)",
    ]);
  });

  it("başka yılın ve bozuk kayıtları atlar", () => {
    expect(nagerBayramlariniAyikla([{ date: "2026-03-20", localName: "Ramazan Bayramı" }, null, 5], 2027)).toEqual([]);
    expect(nagerBayramlariniAyikla({ hata: true }, 2027)).toEqual([]);
  });
});

describe("bayramDurumu", () => {
  const tatiller = [
    { tarih: "2027-03-09", ad: "Ramazan Bayramı (1. gün)" },
    { tarih: "2027-05-19", ad: "Kurban Bayramı (4. gün) / Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  ];
  it("o yıl bayrama ait kesin tatil varsa onaylı", () => {
    expect(bayramDurumu("ramazan", 2027, tatiller, [])).toBe("onayli");
    expect(bayramDurumu("kurban", 2027, tatiller, [])).toBe("onayli");
  });
  it("yoksa bekleyen öneriye, o da yoksa eksik'e düşer", () => {
    expect(bayramDurumu("ramazan", 2028, tatiller, [{ bayram: "ramazan", yil: 2028 }])).toBe("bekliyor");
    expect(bayramDurumu("kurban", 2028, tatiller, [{ bayram: "ramazan", yil: 2028 }])).toBe("eksik");
  });
});

describe("tatilAdiBayrami", () => {
  it("Türkçe büyük harfle de tanır", () => {
    expect(tatilAdiBayrami("KURBAN BAYRAMI (1. GÜN)")).toBe("kurban");
    expect(tatilAdiBayrami("Cumhuriyet Bayramı")).toBeNull();
  });
});

describe("kontrolEdilecekYillar", () => {
  it("Eylül'den önce yalnız bu yıl, sonra gelecek yıl da", () => {
    expect(kontrolEdilecekYillar("2026-08-31")).toEqual([2026]);
    expect(kontrolEdilecekYillar("2026-09-01")).toEqual([2026, 2027]);
  });
});

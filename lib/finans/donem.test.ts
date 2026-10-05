import { afterEach, describe, expect, it, vi } from "vitest";
import { finansDonemiCoz } from "./donem";
import { tumSayfalariOku } from "../supabase/sayfali-okuma";

afterEach(() => {
  vi.useRealTimers();
});

describe("finansDonemiCoz", () => {
  it("aylık dönemi yarı açık aralık ve İstanbul gün sınırıyla çözer", () => {
    const d = finansDonemiCoz({ mod: "aylik", yil: "2026", ay: "10" });
    expect(d.baslangic).toBe("2026-10-01");
    expect(d.bitis).toBe("2026-11-01");
    // İstanbul UTC+3: 1 Ekim 00:00 İstanbul = 30 Eylül 21:00 UTC
    expect(d.baslangicTs).toBe("2026-09-30T21:00:00.000Z");
    expect(d.bitisTs).toBe("2026-10-31T21:00:00.000Z");
  });

  it("aralık ayı yılı atlar", () => {
    const d = finansDonemiCoz({ mod: "aylik", yil: "2026", ay: "12" });
    expect(d.bitis).toBe("2027-01-01");
  });

  it("yıllık dönem tüm yılı kapsar", () => {
    const d = finansDonemiCoz({ mod: "yillik", yil: "2026", ay: "3" });
    expect(d.baslangic).toBe("2026-01-01");
    expect(d.bitis).toBe("2027-01-01");
  });

  it("geçersiz parametrelerde İstanbul'a göre içinde bulunulan aya düşer", () => {
    // 31 Aralık 22:30 UTC = İstanbul'da 1 Ocak 01:30 → yeni yıl/ay
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T22:30:00Z"));
    const d = finansDonemiCoz({ mod: "x", yil: "abc", ay: "99" });
    expect(d.mod).toBe("aylik");
    expect(d.yil).toBe(2027);
    expect(d.ay).toBe(1);
  });
});

describe("tumSayfalariOku", () => {
  it("1000'lik sayfaları sonuna kadar okur", async () => {
    const toplam = 2500;
    const cagrilar: [number, number][] = [];
    const sonuc = await tumSayfalariOku<number>(async (bas, son) => {
      cagrilar.push([bas, son]);
      const satirlar = Array.from({ length: Math.max(0, Math.min(son + 1, toplam) - bas) }, (_, i) => bas + i);
      return { data: satirlar, error: null };
    });
    expect(sonuc).toHaveLength(toplam);
    expect(cagrilar).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("tam 1000 satırda bir sonraki sayfayı da dener", async () => {
    let cagri = 0;
    const sonuc = await tumSayfalariOku<number>(async () => {
      cagri += 1;
      return { data: cagri === 1 ? Array.from({ length: 1000 }, (_, i) => i) : [], error: null };
    });
    expect(sonuc).toHaveLength(1000);
    expect(cagri).toBe(2);
  });

  it("hata olursa sessizce kesmez, fırlatır", async () => {
    await expect(tumSayfalariOku(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});

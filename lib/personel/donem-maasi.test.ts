import { describe, expect, it } from "vitest";
import { donemMaasi } from "./donem-maasi";

const gecmis = [
  { gecerlilik_tarihi: "2026-11-05", maas: 35000, created_at: "2026-11-05T09:00:00Z" },
  { gecerlilik_tarihi: "2026-01-10", maas: 30000, created_at: "2026-01-10T09:00:00Z" },
];

describe("donemMaasi", () => {
  it("ayın son günü itibarıyla geçerli maaşı seçer", () => {
    expect(donemMaasi(gecmis, 35000, "2026-11-01")).toBe(30000); // Ekim → zamdan önce
    expect(donemMaasi(gecmis, 35000, "2026-12-01")).toBe(35000); // Kasım → zam ayın içinde
  });
  it("o tarihten önce satır yoksa bilinen ilk maaş", () => {
    expect(donemMaasi(gecmis, 35000, "2026-01-01")).toBe(30000);
  });
  it("geçmiş yoksa güncel maaş", () => {
    expect(donemMaasi(undefined, 28000, "2026-11-01")).toBe(28000);
    expect(donemMaasi([], null, "2026-11-01")).toBeNull();
  });
  it("aynı gün iki giriş varsa sonra girileni alır", () => {
    const ayniGun = [
      { gecerlilik_tarihi: "2026-10-01", maas: 31000, created_at: "2026-10-01T10:00:00Z" },
      { gecerlilik_tarihi: "2026-10-01", maas: 32000, created_at: "2026-10-01T11:00:00Z" },
    ];
    expect(donemMaasi(ayniGun, 32000, "2026-11-01")).toBe(32000);
  });
});

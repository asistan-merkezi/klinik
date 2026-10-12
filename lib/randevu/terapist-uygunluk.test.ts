import { describe, expect, it } from "vitest";
import { aralikGunleri, terapistGunEngeli } from "./terapist-uygunluk";

describe("aralikGunleri", () => {
  it("izin aralığını sınırla kesiştirir", () => {
    expect(aralikGunleri("2026-10-30", "2026-11-02", "2026-11-01", "2026-11-30")).toEqual(["2026-11-01", "2026-11-02"]);
  });
  it("ay ve yıl geçişini doğru sayar", () => {
    expect(aralikGunleri("2026-12-31", "2027-01-01", "2026-01-01", "2027-12-31")).toEqual(["2026-12-31", "2027-01-01"]);
  });
  it("kesişim yoksa boş", () => {
    expect(aralikGunleri("2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06")).toEqual([]);
  });
});

describe("terapistGunEngeli", () => {
  const u = { cikisTarihi: "2026-10-31", izinliGunler: new Set(["2026-10-20"]) };
  it("çıkış günü dahil atanabilir, sonrası atanamaz", () => {
    expect(terapistGunEngeli(u, "2026-10-31")).toBeNull();
    expect(terapistGunEngeli(u, "2026-11-01")).toMatch(/işten ayrılmış/);
  });
  it("izinli/raporlu gün atanamaz", () => {
    expect(terapistGunEngeli(u, "2026-10-20")).toMatch(/izinli/);
    expect(terapistGunEngeli(u, "2026-10-21")).toBeNull();
  });
  it("çıkış tarihi yoksa yalnız izin kontrolü", () => {
    expect(terapistGunEngeli({ cikisTarihi: null, izinliGunler: new Set() }, "2030-01-01")).toBeNull();
  });
});

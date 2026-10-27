import { describe, expect, it } from "vitest";
import { geceKapanisinaTakildi, sonKapanisAni } from "./gece-kapanis";

// Istanbul = UTC+3. Yardımcı: Istanbul saatiyle tarih üretir.
const ist = (gun: string, saat: string) => new Date(`${gun}T${saat}:00+03:00`);

describe("gece zorunlu çıkış", () => {
  it("mesai içinde (08:00-19:59) son kapanış 07:00'dir", () => {
    expect(sonKapanisAni(ist("2026-10-27", "14:35")).toISOString()).toBe(ist("2026-10-27", "07:00").toISOString());
    expect(sonKapanisAni(ist("2026-10-27", "19:59")).toISOString()).toBe(ist("2026-10-27", "07:00").toISOString());
  });
  it("gece her tam saat kapanıştır", () => {
    expect(sonKapanisAni(ist("2026-10-27", "20:00")).toISOString()).toBe(ist("2026-10-27", "20:00").toISOString());
    expect(sonKapanisAni(ist("2026-10-27", "22:30")).toISOString()).toBe(ist("2026-10-27", "22:00").toISOString());
    expect(sonKapanisAni(ist("2026-10-28", "00:10")).toISOString()).toBe(ist("2026-10-28", "00:00").toISOString());
    expect(sonKapanisAni(ist("2026-10-28", "07:05")).toISOString()).toBe(ist("2026-10-28", "07:00").toISOString());
  });
  it("resepsiyon/terapist: mesai oturumu 20:00'de düşer, mesai içinde açık kalır", () => {
    const acilis = ist("2026-10-27", "09:00");
    expect(geceKapanisinaTakildi("resepsiyon", acilis, ist("2026-10-27", "19:59"))).toBe(false);
    expect(geceKapanisinaTakildi("terapist", acilis, ist("2026-10-27", "20:00"))).toBe(true);
    expect(geceKapanisinaTakildi("terapist", acilis, ist("2026-10-27", "20:05"))).toBe(true);
  });
  it("gece açılan oturum bir sonraki tam saatte düşer", () => {
    const acilis = ist("2026-10-27", "21:10");
    expect(geceKapanisinaTakildi("resepsiyon", acilis, ist("2026-10-27", "21:59"))).toBe(false);
    expect(geceKapanisinaTakildi("resepsiyon", acilis, ist("2026-10-27", "22:00"))).toBe(true);
  });
  it("sabah 07:00 sonrası açılan oturum gün boyu geçerli", () => {
    const acilis = ist("2026-10-28", "07:30");
    expect(geceKapanisinaTakildi("terapist", acilis, ist("2026-10-28", "19:59"))).toBe(false);
  });
  it("diğer roller ve hasta etkilenmez", () => {
    const acilis = ist("2026-10-27", "09:00");
    for (const rol of ["klinik_admin", "muhasebe", "super_admin", "hasta"]) expect(geceKapanisinaTakildi(rol, acilis, ist("2026-10-28", "03:00")), rol).toBe(false);
  });
});

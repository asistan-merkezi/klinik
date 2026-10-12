import { describe, expect, it } from "vitest";
import { hatirlatmaGerekliMi, hatirlatmaPenceresi, randevuMesajAnahtari } from "./randevu-hatirlatma-kurali";

const SIMDI = new Date("2026-10-12T10:00:00.000Z");

describe("hatirlatmaPenceresi", () => {
  it("1 gün: şimdiden 23-24 saat sonrası", () => {
    expect(hatirlatmaPenceresi("randevu_hatirlatma_1gun", SIMDI)).toEqual({
      alt: "2026-10-13T09:00:00.000Z",
      ust: "2026-10-13T10:00:00.000Z",
    });
  });
  it("2 saat: şimdiden 1-2 saat sonrası", () => {
    expect(hatirlatmaPenceresi("randevu_hatirlatma_2saat", SIMDI)).toEqual({
      alt: "2026-10-12T11:00:00.000Z",
      ust: "2026-10-12T12:00:00.000Z",
    });
  });
});

describe("hatirlatmaGerekliMi", () => {
  const baslangic = "2026-10-13T10:00:00.000Z";
  it("hatırlatma zamanından önce alınmış randevu hatırlatılır", () => {
    expect(hatirlatmaGerekliMi("randevu_hatirlatma_1gun", { created_at: "2026-10-10T10:00:00.000Z", baslangic })).toBe(true);
  });
  it("1 günden az kala alınan randevuya '1 gün kaldı' gitmez", () => {
    expect(hatirlatmaGerekliMi("randevu_hatirlatma_1gun", { created_at: "2026-10-12T20:00:00.000Z", baslangic })).toBe(false);
  });
  it("2 saatten az kala alınan randevuya '2 saat kaldı' gitmez, sınırda gider", () => {
    expect(hatirlatmaGerekliMi("randevu_hatirlatma_2saat", { created_at: "2026-10-13T08:30:00.000Z", baslangic })).toBe(false);
    expect(hatirlatmaGerekliMi("randevu_hatirlatma_2saat", { created_at: "2026-10-13T08:00:00.000Z", baslangic })).toBe(true);
  });
});

describe("randevuMesajAnahtari", () => {
  const r = { id: "r1", baslangic: "2026-10-13T10:00:00.000Z" };
  it("onay ve gelmedi randevu başına tek", () => {
    expect(randevuMesajAnahtari("randevu_onay", r)).toBe("randevu_onay:r1");
    expect(randevuMesajAnahtari("randevu_gelmedi", { ...r, baslangic: "x" })).toBe("randevu_gelmedi:r1");
  });
  it("hatırlatma ertelenince yeni anahtar alır", () => {
    expect(randevuMesajAnahtari("randevu_hatirlatma_1gun", r)).not.toBe(
      randevuMesajAnahtari("randevu_hatirlatma_1gun", { ...r, baslangic: "2026-10-14T10:00:00.000Z" })
    );
  });
  it("iptal → geri al → yeniden iptal ayrı bildirimdir", () => {
    const a = randevuMesajAnahtari("randevu_iptal", { ...r, durum: "iptal", iptal_tarihi: "2026-10-12T10:00:00Z" });
    const b = randevuMesajAnahtari("randevu_iptal", { ...r, durum: "iptal", iptal_tarihi: "2026-10-12T11:00:00Z" });
    expect(a).not.toBe(b);
  });
});

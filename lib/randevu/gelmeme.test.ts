import { describe, expect, it } from "vitest";
import { gelmemeAnaliziniHazirla, yuzdeFormat, type GelmemeRpcSatiri } from "./gelmeme";

const satir = (p: Partial<GelmemeRpcSatiri> & Pick<GelmemeRpcSatiri, "boyut" | "anahtar">): GelmemeRpcSatiri => ({
  etiket: p.anahtar,
  gerceklesen: 0,
  gelmedi: 0,
  gecikmeli: 0,
  iptal: 0,
  ertelendi: 0,
  isaretlenmemis: 0,
  ...p,
});

describe("gelmemeAnaliziniHazirla", () => {
  it("oranı gelmedi / (gerçekleşen + gelmedi) olarak hesaplar; iptal ve işaretlenmemiş paydaya girmez", () => {
    const a = gelmemeAnaliziniHazirla([
      satir({ boyut: "toplam", anahtar: "toplam", gerceklesen: 90, gelmedi: 10, gecikmeli: 9, iptal: 50, isaretlenmemis: 7 }),
    ]);
    expect(a.toplam.gelmemeOrani).toBeCloseTo(0.1);
    expect(a.toplam.gecikmeOrani).toBeCloseTo(0.1);
    expect(a.toplam.sonuclanan).toBe(100);
  });

  it("veri yoksa boş toplam ve null oran döner", () => {
    const a = gelmemeAnaliziniHazirla([]);
    expect(a.toplam.gelmemeOrani).toBeNull();
    expect(yuzdeFormat(a.toplam.gelmemeOrani)).toBe("—");
  });

  it("terapistleri orana göre sıralar, az verili olanları sona koyar", () => {
    const a = gelmemeAnaliziniHazirla([
      satir({ boyut: "terapist", anahtar: "a", etiket: "Ayşe", gerceklesen: 18, gelmedi: 2 }),
      satir({ boyut: "terapist", anahtar: "b", etiket: "Bora", gerceklesen: 15, gelmedi: 5 }),
      satir({ boyut: "terapist", anahtar: "c", etiket: "Cem", gerceklesen: 1, gelmedi: 2 }),
    ]);
    expect(a.terapist.map((t) => t.etiket)).toEqual(["Bora", "Ayşe", "Cem"]);
  });

  it("gün anahtarını Türkçe gün adına çevirir ve doğal sırada dizer", () => {
    const a = gelmemeAnaliziniHazirla([
      satir({ boyut: "gun", anahtar: "7" }),
      satir({ boyut: "gun", anahtar: "1" }),
    ]);
    expect(a.gun.map((g) => g.etiket)).toEqual(["Pazartesi", "Pazar"]);
  });
});

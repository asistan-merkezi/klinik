import { describe, expect, it } from "vitest";
import { hareketleriGorunumeCevir } from "./bakiye-hareket-gorunum";
import type { HastaBakiyeHareket } from "@/types/hasta-detay";

// Aynı senaryo SQL tarafında da sabitlenir (tests/db/modul-finans.test.ts: v_hasta_ozet.bakiye = −925,00): JS ve SQL AYNI sonucu vermeli.
const h = (tur: string, tutar: number, iskonto = 0) =>
  ({ id: `${tur}-${tutar}`, tur, tutar, iskonto_tutari: iskonto, odeme_id: null, randevu: null, odeme: null, iskonto_uygulayan: null }) as unknown as HastaBakiyeHareket;

describe("hasta cari görünümü (JS) ↔ v_hasta_ozet (SQL) bakiye kuralı", () => {
  it("yürüyen bakiye en yeniden eskiye: −925 → −950 → −900 → −1000 → −1400 → −900 ve float birikimi yok", () => {
    const yeniler = [h("kredi", 25), h("iade", 50), h("odeme", 100), h("odeme", 400), h("borc", 500), h("borc", 1000, 100)];
    const g = hareketleriGorunumeCevir(yeniler, -925);
    expect(g.map((x) => x.bakiyeSonrasi)).toEqual([-925, -950, -900, -1000, -1400, -900]);
  });

  it("kuruşlu tutarlarda birikim hatası olmaz (0,1 × 30 ödeme)", () => {
    const g = hareketleriGorunumeCevir(Array.from({ length: 30 }, () => h("odeme", 0.1)), 3);
    expect(g[g.length - 1].bakiyeSonrasi).toBe(0.1);
    expect(g[0].bakiyeSonrasi).toBe(3);
  });
});

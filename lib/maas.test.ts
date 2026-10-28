import { describe, expect, it } from "vitest";
import { maasHesapla } from "./maas";

const baz = { maas_hesaplama_modeli: "sabit" as const, sabit_maas: 30000, prim_sabit_tutar: null, baraj_seans_sayisi: null, baraj_bonus_tutari: null };

describe("maaş / hakediş (kuruş aritmetiği)", () => {
  it("tam ay: taban = maaş, prim = seans × birim prim (float hatası yok)", () => {
    const s = maasHesapla({ ...baz, prim_sabit_tutar: 12.35 }, 7, 0);
    expect(s.taban).toBe(30000);
    expect(s.prim).toBe(86.45); // 7 × 12,35
    expect(s.toplam).toBe(30086.45);
  });
  it("kısmi ay: maaş × çalışılan gün / ay günü, kuruşa yarım yukarı", () => {
    // 30000 × 10/31 = 9677,4193… → 9677,42
    const s = maasHesapla({ ...baz, ayBaslangicTarih: "2026-10-01", ayBitisTarihExclusive: "2026-11-01", iseGirisTarihi: "2026-10-22" }, 0, 0);
    expect(s.taban).toBe(9677.42);
  });
  it("0,1 birim primle 3 seans tam 0,30", () => {
    expect(maasHesapla({ ...baz, sabit_maas: 0, prim_sabit_tutar: 0.1 }, 3, 0).prim).toBe(0.3);
  });
});

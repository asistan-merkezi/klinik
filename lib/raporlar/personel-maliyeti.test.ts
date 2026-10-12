import { describe, expect, it } from "vitest";
import { donemAylari, personelMaliyetiniTopla } from "./personel-maliyeti";

describe("donemAylari", () => {
  it("yıllık dönemi bugünün ayına kadar keser", () => {
    expect(donemAylari("2026-01-01", "2027-01-01", "2026-03-15")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
  it("aylık dönem tek ay", () => {
    expect(donemAylari("2026-10-01", "2026-11-01", "2026-12-01")).toEqual(["2026-10"]);
  });
  it("gelecek ay boş", () => {
    expect(donemAylari("2027-01-01", "2027-02-01", "2026-10-12")).toEqual([]);
  });
});

describe("personelMaliyetiniTopla", () => {
  const personeller = [
    { id: "t1", ad_soyad: "Terapist Bir", terapistMi: true },
    { id: "r1", ad_soyad: "Resepsiyon", terapistMi: false },
  ];

  it("kapalı dönemde primi bir kez sayar (dönem primi sabit, elle prim ekstra)", () => {
    const sonuc = personelMaliyetiniTopla(
      personeller,
      [
        { personel_id: "t1", tur: "hakedis", tutar: 30000, kaynak_id: "d1" },
        { personel_id: "t1", tur: "prim", tutar: 2000, kaynak_id: "d1" },
        { personel_id: "t1", tur: "prim", tutar: 500, kaynak_id: null },
        { personel_id: "t1", tur: "avans", tutar: 5000, kaynak_id: null },
        { personel_id: "r1", tur: "hakedis", tutar: 25000, kaynak_id: "d2" },
        { personel_id: "r1", tur: "yol", tutar: 1000, kaynak_id: null },
      ],
      []
    );
    expect(sonuc.sabitToplam).toBe(57000);
    expect(sonuc.ekstraToplam).toBe(1500);
    expect(sonuc.toplamMaas).toBe(58500);
    expect(sonuc.terapistPrimleri).toHaveLength(1);
    expect(sonuc.terapistPrimleri[0]).toMatchObject({ taban: 30000, prim: 2000, ekstraToplam: 500, toplam: 32500 });
  });

  it("açık dönem tahminini ekler, ayları toplar", () => {
    const sonuc = personelMaliyetiniTopla(
      personeller,
      [{ personel_id: "r1", tur: "hakedis", tutar: 25000, kaynak_id: "d2" }],
      [
        { personelId: "r1", taban: 25000, prim: 0, seans: 0 },
        { personelId: "t1", taban: 30000, prim: 1200, seans: 12 },
      ]
    );
    expect(sonuc.sabitToplam).toBe(81200);
    expect(sonuc.terapistPrimleri[0].aciklama).toContain("12 seans");
  });
});

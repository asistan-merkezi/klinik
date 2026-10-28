import { describe, expect, it } from "vitest";
import { jetonDurumuHesapla } from "./jeton-durumu";

const simdi = new Date("2026-11-01T12:00:00Z");
const dosya = (o: object) => JSON.stringify(o);

describe("jetonDurumuHesapla", () => {
  it("dosya yok / bozuk → bilinmiyor", () => {
    expect(jetonDurumuHesapla(null, simdi).durum).toBe("bilinmiyor");
    expect(jetonDurumuHesapla("{bozuk", simdi).durum).toBe("bilinmiyor");
  });
  it("taze kontrol, uzak son kullanma → ok", () => {
    expect(jetonDurumuHesapla(dosya({ kontrol: "2026-11-01T04:00:00Z", durum: "ok", sonKullanma: "2027-02-01T00:00:00Z" }), simdi)).toEqual({ durum: "ok", kalanGun: 91 });
  });
  it("son kullanmaya ≤14 gün → yaklasiyor; geçmiş → dolmus", () => {
    expect(jetonDurumuHesapla(dosya({ kontrol: "2026-11-01T04:00:00Z", durum: "ok", sonKullanma: "2026-11-10T00:00:00Z" }), simdi).durum).toBe("yaklasiyor");
    expect(jetonDurumuHesapla(dosya({ kontrol: "2026-11-01T04:00:00Z", durum: "ok", sonKullanma: "2026-10-31T00:00:00Z" }), simdi).durum).toBe("dolmus");
  });
  it("reddedildi her şeyi geçer", () => {
    expect(jetonDurumuHesapla(dosya({ kontrol: "2026-11-01T04:00:00Z", durum: "reddedildi", sonKullanma: "2027-02-01T00:00:00Z" }), simdi).durum).toBe("reddedildi");
  });
  it("son kullanma bilinmiyor + 72 saatten eski kontrol → kontrol_eski (görev çalışmıyor)", () => {
    expect(jetonDurumuHesapla(dosya({ kontrol: "2026-10-20T04:00:00Z", durum: "ok", sonKullanma: null }), simdi)).toEqual({ durum: "kontrol_eski", kalanGun: null });
    expect(jetonDurumuHesapla(dosya({ kontrol: "2026-11-01T04:00:00Z", durum: "ok", sonKullanma: null }), simdi).durum).toBe("ok");
  });
});

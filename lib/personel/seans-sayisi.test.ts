import { describe, expect, it } from "vitest";
import { seansSayilariniGetir } from "./seans-sayisi";

type Satir = { id: string; terapist_id: string; baslangic: string; durum: string };

/** in/gte/lt/order/range zincirini bellekte süzen sahte client; her sayfa çağrısını kaydeder. */
function sahteSupabase(satirlar: Satir[]) {
  const inCagrilari: unknown[][] = [];
  const client = {
    from() {
      let f = [...satirlar];
      const b = {
        select: () => b,
        in(kolon: string, degerler: string[]) {
          if (kolon === "terapist_id") inCagrilari.push(degerler);
          f = f.filter((r) => degerler.includes(r[kolon as keyof Satir]));
          return b;
        },
        gte(kolon: string, d: string) {
          f = f.filter((r) => r[kolon as keyof Satir] >= d);
          return b;
        },
        lt(kolon: string, d: string) {
          f = f.filter((r) => r[kolon as keyof Satir] < d);
          return b;
        },
        order: () => b,
        range: (bas: number, son: number) => Promise.resolve({ data: f.slice(bas, son + 1), error: null }),
      };
      return b;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, inCagrilari };
}

describe("seansSayilariniGetir", () => {
  it("İstanbul ay sınırını ve çıkış tarihini uygular, iptalleri saymaz", async () => {
    const { client } = sahteSupabase([
      // 1 Ekim 00:30 İstanbul = 30 Eylül 21:30 UTC → Ekim'e sayılır
      { id: "1", terapist_id: "t1", baslangic: "2026-09-30T21:30:00.000Z", durum: "tamamlandi" },
      // 30 Eylül 23:30 İstanbul → Eylül, sayılmaz
      { id: "2", terapist_id: "t1", baslangic: "2026-09-30T20:30:00.000Z", durum: "tamamlandi" },
      { id: "3", terapist_id: "t1", baslangic: "2026-10-10T08:00:00.000Z", durum: "iptal" },
      // t2'nin çıkışı 15 Ekim: 16 Ekim seansı sayılmaz
      { id: "4", terapist_id: "t2", baslangic: "2026-10-15T08:00:00.000Z", durum: "geldi" },
      { id: "5", terapist_id: "t2", baslangic: "2026-10-16T08:00:00.000Z", durum: "geldi" },
    ]);
    const sonuc = await seansSayilariniGetir(
      client,
      [
        { terapistId: "t1", personelId: "p1", istenCikisTarihi: null },
        { terapistId: "t2", personelId: "p2", istenCikisTarihi: "2026-10-15" },
      ],
      "2026-10"
    );
    expect(sonuc.get("p1")).toBe(1);
    expect(sonuc.get("p2")).toBe(1);
  });

  it("1000'den fazla seansı ve uzun terapist listesini kesmeden sayar", async () => {
    const satirlar: Satir[] = Array.from({ length: 2300 }, (_, i) => ({
      id: String(i).padStart(5, "0"),
      terapist_id: "t1",
      baslangic: "2026-10-10T08:00:00.000Z",
      durum: "tamamlandi",
    }));
    const terapistler = Array.from({ length: 250 }, (_, i) => ({
      terapistId: i === 0 ? "t1" : `x${i}`,
      personelId: i === 0 ? "p1" : `px${i}`,
      istenCikisTarihi: null,
    }));
    const { client, inCagrilari } = sahteSupabase(satirlar);
    const sonuc = await seansSayilariniGetir(client, terapistler, "2026-10");
    expect(sonuc.get("p1")).toBe(2300);
    expect(inCagrilari.every((ids) => ids.length <= 100)).toBe(true);
  });
});

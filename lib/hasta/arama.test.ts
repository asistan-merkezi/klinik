import { describe, expect, it } from "vitest";
import { hastaAra, hastaAramaFiltresi } from "./arama";

describe("hastaAramaFiltresi", () => {
  it("isimde yalnız ad_soyad koşulu üretir", () => {
    expect(hastaAramaFiltresi("Ayşe")).toBe("ad_soyad.ilike.%Ayşe%");
  });

  it("boşluklu/sıfırlı telefonu rakamlara indirger", () => {
    expect(hastaAramaFiltresi("0532 123 45 67")).toBe("ad_soyad.ilike.%0532 123 45 67%,telefon.ilike.%5321234567%");
    expect(hastaAramaFiltresi("+90 532 123 4567")).toContain("telefon.ilike.%5321234567%");
  });

  it("kısmi telefonda baştaki sıfırı atar", () => {
    expect(hastaAramaFiltresi("0532")).toContain("telefon.ilike.%532%");
  });

  it("PostgREST ve ILIKE özel karakterlerini temizler", () => {
    expect(hastaAramaFiltresi("a,b(c)%_")).toBe("ad_soyad.ilike.%a b c%");
    expect(hastaAramaFiltresi(" ,() ")).toBeNull();
  });
});

describe("hastaAra", () => {
  function sahte(rpcHata: { code: string; message: string } | null) {
    const cagrilar: string[] = [];
    const client = {
      rpc: () => ({
        select: async () => (rpcHata ? { data: null, error: rpcHata } : { data: [{ id: "rpc" }], error: null }),
      }),
      from: () => {
        const b = {
          select: () => b,
          or: (f: string) => {
            cagrilar.push(f);
            return b;
          },
          order: () => b,
          limit: async () => ({ data: [{ id: "yedek" }], error: null }),
        };
        return b;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { client: client as any, cagrilar };
  }

  it("RPC varsa onun sonucunu döner", async () => {
    const { client } = sahte(null);
    expect((await hastaAra(client, "sahin", "id", 8)).data).toEqual([{ id: "rpc" }]);
  });

  it("RPC yoksa ILIKE yedeğine düşer", async () => {
    const { client, cagrilar } = sahte({ code: "PGRST202", message: "yok" });
    expect((await hastaAra(client, "sahin", "id", 8)).data).toEqual([{ id: "yedek" }]);
    expect(cagrilar[0]).toBe("ad_soyad.ilike.%sahin%");
  });

  it("başka RPC hatasını yutmaz", async () => {
    const { client } = sahte({ code: "57014", message: "timeout" });
    expect((await hastaAra(client, "sahin", "id", 8)).error?.message).toBe("timeout");
  });
});

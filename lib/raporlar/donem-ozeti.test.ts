import { describe, expect, it } from "vitest";
import { hesaplaDonemOzeti } from "./hesaplamalar";
import { raporAyDonemi } from "./donem";

const donem = raporAyDonemi(2026, 10);

/** Yalnız rpc() ve sayfalı from() zincirini karşılayan sahte client. */
function sahte(rpcSonucu: { data: unknown; error: { code?: string; message: string } | null }, satirlar: Record<string, unknown[]> = {}) {
  return {
    rpc: async () => rpcSonucu,
    from(tablo: string) {
      const b = {
        select: () => b,
        eq: () => b,
        neq: () => b,
        not: () => b,
        in: () => b,
        gte: () => b,
        lt: () => b,
        order: () => b,
        range: () => {
          const sonuc = Promise.resolve({ data: satirlar[tablo] ?? [], error: null });
          return Object.assign(sonuc, { returns: () => sonuc });
        },
      };
      return b;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("hesaplaDonemOzeti", () => {
  it("RPC sonucunu (numeric string'ler dahil) uygulama tipine çevirir", async () => {
    const ozet = await hesaplaDonemOzeti(
      sahte({
        data: {
          gelir: { nakit: "1000", kredi_karti: 500, banka_havalesi: 0, belirtilmemis: 50, iade: "300" },
          isletme_gideri: 200,
          diger_giderler: 10,
          faturali_giderler: "40",
          muhasebe_gideri: 5,
          randevu: { tamamlanan: 7, planlanan: 2, ertelenen: 1, iptal_ve_gelmedi: 3, toplam: 13 },
        },
        error: null,
      }),
      "k",
      donem
    );
    expect(ozet.gelir).toEqual({ nakit: 1000, krediKarti: 500, bankaHavalesi: 0, belirtilmemis: 50, iade: 300, netTahsilat: 1250 });
    expect(ozet.faturaliGiderler).toBe(40);
    expect(ozet.randevuDurumu.iptalVeGelmedi).toBe(3);
  });

  it("RPC yoksa (migration uygulanmamış) JS hesabına düşer", async () => {
    const ozet = await hesaplaDonemOzeti(
      sahte(
        { data: null, error: { code: "PGRST202", message: "not found" } },
        { hasta_bakiye_hareket: [{ id: "1", created_at: "2026-10-05T10:00:00Z", tur: "odeme", tutar: 700, odeme_yontemi: "nakit" }] }
      ),
      "k",
      donem
    );
    expect(ozet.gelir.netTahsilat).toBe(700);
  });

  it("başka bir RPC hatasında eksik veriyle devam etmez, fırlatır", async () => {
    await expect(hesaplaDonemOzeti(sahte({ data: null, error: { code: "57014", message: "timeout" } }), "k", donem)).rejects.toThrow();
  });
});

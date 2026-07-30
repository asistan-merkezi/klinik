import { describe, expect, it } from "vitest";
import { hesaplaFaturaliGiderler, hesaplaIsletmeGideri, hesaplaMuhasebeGideri } from "./hesaplamalar";
import { raporAyDonemi } from "./donem";

type FakeSatir = Record<string, unknown>;

/**
 * klinik_harcama üzerindeki eq/neq/gte/lt zincirini in-memory filtreleyen
 * minimal sahte Supabase client'ı — gerçek PostgREST builder'ının tipini
 * taklit etmeye çalışmak yerine sadece bu testin kullandığı zinciri karşılar.
 */
function fakeSupabase(rows: FakeSatir[]) {
  return {
    from() {
      let filtreli = rows;
      const builder = {
        select() {
          return builder;
        },
        eq(kolon: string, deger: unknown) {
          filtreli = filtreli.filter((r) => r[kolon] === deger);
          return builder;
        },
        neq(kolon: string, deger: unknown) {
          filtreli = filtreli.filter((r) => r[kolon] !== deger);
          return builder;
        },
        gte(kolon: string, deger: unknown) {
          filtreli = filtreli.filter((r) => (r[kolon] as string) >= (deger as string));
          return builder;
        },
        lt(kolon: string, deger: unknown) {
          filtreli = filtreli.filter((r) => (r[kolon] as string) < (deger as string));
          return builder;
        },
        returns<T>() {
          return Promise.resolve({ data: filtreli as unknown as T });
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("klinik_harcama çift sayım kontrolü", () => {
  const donem = raporAyDonemi(2026, 7);
  const klinikId = "klinik-1";

  it("is_faturali=true kayıt İşletme Gideri'ne dahil olmaz, Faturalı Giderler'e dahil olur", async () => {
    const supabase = fakeSupabase([
      { klinik_id: klinikId, kategori: "kira", is_faturali: true, tutar: 1000, tarih: "2026-07-15" },
    ]);

    const isletmeGideri = await hesaplaIsletmeGideri(supabase, klinikId, donem);
    const faturaliGiderler = await hesaplaFaturaliGiderler(supabase, klinikId, donem);

    expect(isletmeGideri).toBe(0);
    expect(faturaliGiderler).toBe(1000);
  });

  it("is_faturali=false kayıt sadece İşletme Gideri'ne dahil olur", async () => {
    const supabase = fakeSupabase([
      { klinik_id: klinikId, kategori: "malzeme", is_faturali: false, tutar: 500, tarih: "2026-07-10" },
    ]);

    const isletmeGideri = await hesaplaIsletmeGideri(supabase, klinikId, donem);
    const faturaliGiderler = await hesaplaFaturaliGiderler(supabase, klinikId, donem);

    expect(isletmeGideri).toBe(500);
    expect(faturaliGiderler).toBe(0);
  });

  it("kategori='vergi_sgk' kayıt sadece Muhasebe giderine dahil olur, İşletme/Faturalı Giderler'e girmez", async () => {
    const supabase = fakeSupabase([
      { klinik_id: klinikId, kategori: "vergi_sgk", is_faturali: false, tutar: 2000, tarih: "2026-07-05" },
    ]);

    const isletmeGideri = await hesaplaIsletmeGideri(supabase, klinikId, donem);
    const faturaliGiderler = await hesaplaFaturaliGiderler(supabase, klinikId, donem);
    const muhasebeGideri = await hesaplaMuhasebeGideri(supabase, klinikId, donem);

    expect(isletmeGideri).toBe(0);
    expect(faturaliGiderler).toBe(0);
    expect(muhasebeGideri).toBe(2000);
  });
});

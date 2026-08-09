import { describe, expect, it } from "vitest";
import { hesaplaFaturaliGiderler, hesaplaIsletmeGideri, hesaplaMuhasebeGideri } from "./hesaplamalar";
import { raporAyDonemi } from "./donem";

type FakeSatir = Record<string, unknown>;

/**
 * klinik_harcama/kamusal_odeme üzerindeki eq/neq/not/gte/lt zincirini
 * in-memory filtreleyen minimal sahte Supabase client'ı — tablo adına göre
 * ayrı satır kümeleri tutar (gerçek PostgREST builder'ının tipini taklit
 * etmeye çalışmak yerine sadece bu testlerin kullandığı zinciri karşılar).
 */
function fakeSupabase(tablolar: Record<string, FakeSatir[]>) {
  return {
    from(tablo: string) {
      let filtreli = tablolar[tablo] ?? [];
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
        not(kolon: string, _op: string, deger: unknown) {
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
    const supabase = fakeSupabase({
      klinik_harcama: [
        { klinik_id: klinikId, kategori: "kira", is_faturali: true, tutar: 1000, tarih: "2026-07-15" },
      ],
    });

    const isletmeGideri = await hesaplaIsletmeGideri(supabase, klinikId, donem);
    const faturaliGiderler = await hesaplaFaturaliGiderler(supabase, klinikId, donem);

    expect(isletmeGideri).toBe(0);
    expect(faturaliGiderler).toBe(1000);
  });

  it("is_faturali=false kayıt sadece İşletme Gideri'ne dahil olur", async () => {
    const supabase = fakeSupabase({
      klinik_harcama: [
        { klinik_id: klinikId, kategori: "malzeme", is_faturali: false, tutar: 500, tarih: "2026-07-10" },
      ],
    });

    const isletmeGideri = await hesaplaIsletmeGideri(supabase, klinikId, donem);
    const faturaliGiderler = await hesaplaFaturaliGiderler(supabase, klinikId, donem);

    expect(isletmeGideri).toBe(500);
    expect(faturaliGiderler).toBe(0);
  });
});

describe("kamusal_odeme — Muhasebe (Vergi, SGK) gideri", () => {
  const donem = raporAyDonemi(2026, 7);
  const klinikId = "klinik-1";

  it("sadece ödeme_tarihi dolu (fiilen ödenmiş) ve dönem içine düşen kayıtlar sayılır", async () => {
    const supabase = fakeSupabase({
      kamusal_odeme: [
        { klinik_id: klinikId, tutar: 2000, odeme_tarihi: "2026-07-05" },
        { klinik_id: klinikId, tutar: 999, odeme_tarihi: null }, // henüz ödenmedi (Bekliyor/Gecikti), sayılmaz
        { klinik_id: klinikId, tutar: 500, odeme_tarihi: "2026-06-20" }, // dönem dışı, sayılmaz
      ],
    });

    const muhasebeGideri = await hesaplaMuhasebeGideri(supabase, klinikId, donem);
    expect(muhasebeGideri).toBe(2000);
  });
});

import { describe, expect, it } from "vitest";
import { isoZaman, zamanlariIsoyaCevir } from "./zaman";

describe("zaman damgası ISO çevirimi", () => {
  it("Postgres biçimini ISO'ya çevirir", () => {
    expect(isoZaman("2026-10-27 12:00:00+00")).toBe("2026-10-27T12:00:00.000Z");
    expect(isoZaman("2026-10-27 15:30:00.123456+03")).toBe("2026-10-27T12:30:00.123Z");
    expect(isoZaman("2026-10-27 15:30:00+03:30")).toBe("2026-10-27T12:00:00.000Z");
  });
  it("tarih-yalnız ve diğer metinlere dokunmaz; ağaç içinde çalışır", () => {
    expect(isoZaman("2026-10-27")).toBe("2026-10-27");
    expect(isoZaman("Ayşe 12:00")).toBe("Ayşe 12:00");
    expect(zamanlariIsoyaCevir({ a: [{ b: "2026-10-27 12:00:00+00", c: "x", d: 5, e: null }] })).toEqual({ a: [{ b: "2026-10-27T12:00:00.000Z", c: "x", d: 5, e: null }] });
  });
});

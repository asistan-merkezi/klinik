import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DosyaHatasi, dosyaOku, dosyaSil, dosyaYaz, dosyaYolu } from "./depo";

let kok: string;
beforeAll(() => {
  kok = fs.mkdtempSync(path.join(os.tmpdir(), "klinik-dosya-"));
  process.env.DOSYA_KOKU = kok;
});
afterAll(() => fs.rmSync(kok, { recursive: true, force: true }));

describe("dosya deposu", () => {
  it("yazar, okur, siler; eksik dosya null döner", async () => {
    await dosyaYaz("klinik-logo", ["k1", "logo.png"], Buffer.from("abc"));
    expect((await dosyaOku("klinik-logo", ["k1", "logo.png"]))?.toString()).toBe("abc");
    await dosyaSil("klinik-logo", ["k1", "logo.png"]);
    expect(await dosyaOku("klinik-logo", ["k1", "logo.png"])).toBeNull();
    await dosyaSil("klinik-logo", ["k1", "yok.png"]); // yoksa hata vermez
  });

  it("yol gezinme ve geçersiz parçalar reddedilir", () => {
    for (const kotu of [["..", "x"], ["k1", "../../etc"], ["k1/../x"], ["/mutlak"], ["a\b"], [""], ["k1", ".gizli"], ["x".repeat(200)]]) {
      expect(() => dosyaYolu("hasta-belge", kotu), JSON.stringify(kotu)).toThrowError(DosyaHatasi);
    }
    expect(() => dosyaYolu("baska" as never, ["x"])).toThrowError(DosyaHatasi);
    expect(() => dosyaYolu("hasta-belge", [])).toThrowError(DosyaHatasi);
  });

  it("çözülen yol her zaman kategori klasörünün içindedir", () => {
    const y = dosyaYolu("hasta-belge", ["k1", "h1", "radyoloji", "b1.pdf"]);
    expect(y.startsWith(path.join(kok, "hasta-belge") + path.sep)).toBe(true);
  });

  it("atomik yazım: geçici dosya kalmaz", async () => {
    await dosyaYaz("personel-belge", ["k1", "izin.pdf"], Buffer.from("x"));
    expect(fs.readdirSync(path.join(kok, "personel-belge", "k1")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});

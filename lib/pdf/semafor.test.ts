import { describe, expect, it } from "vitest";
import { PdfKuyrukDolu, Semafor } from "./semafor";
import { istekIzinliMi } from "./browser";

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Semafor", () => {
  it("aynı anda en fazla `maks` iş çalışır; fazlası sırayla çalışır ve hepsi tamamlanır", async () => {
    const s = new Semafor(2, 10, 5_000);
    let aktif = 0;
    let enCok = 0;
    const is = async () => {
      aktif++;
      enCok = Math.max(enCok, aktif);
      await bekle(30);
      aktif--;
      return 1;
    };
    const sonuc = await Promise.all(Array.from({ length: 7 }, () => s.calistir(is)));
    expect(sonuc).toHaveLength(7);
    expect(enCok).toBe(2);
    expect(s.durum).toEqual({ aktif: 0, bekleyen: 0 });
  });

  it("kuyruk dolunca HEMEN reddeder (kuyruk_dolu); yer açılınca yeniden kabul eder", async () => {
    const s = new Semafor(1, 2, 5_000);
    const uzun = () => bekle(80);
    const bekleyenler = [s.calistir(uzun), s.calistir(uzun), s.calistir(uzun)]; // 1 aktif + 2 bekleyen
    await expect(s.calistir(uzun)).rejects.toMatchObject({ neden: "kuyruk_dolu" });
    await Promise.all(bekleyenler);
    await expect(s.calistir(async () => "tamam")).resolves.toBe("tamam");
  });

  it("sırada bekleme süresi aşılırsa reddeder (bekleme_zaman_asimi) ve yuvayı sızdırmaz", async () => {
    const s = new Semafor(1, 5, 30);
    const uzun = s.calistir(() => bekle(150));
    await expect(s.calistir(async () => 1)).rejects.toBeInstanceOf(PdfKuyrukDolu);
    await uzun;
    expect(s.durum).toEqual({ aktif: 0, bekleyen: 0 });
    await expect(s.calistir(async () => "hala çalışır")).resolves.toBe("hala çalışır");
  });

  it("iş hata verse bile yuva geri verilir", async () => {
    const s = new Semafor(1, 1, 1_000);
    await expect(s.calistir(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(s.durum.aktif).toBe(0);
  });
});

describe("istekIzinliMi (Chromium istek yakalama)", () => {
  it("yalnız data: ve about:blank serbest; http(s), file, ftp, blob, ws, chrome ve ağ-yol kısaltmaları engellenir", () => {
    expect(istekIzinliMi("data:image/png;base64,AAAA")).toBe(true);
    expect(istekIzinliMi("DATA:font/woff2;base64,AAAA")).toBe(true);
    expect(istekIzinliMi("about:blank")).toBe(true);
    for (const kotu of [
      "http://127.0.0.1:3000/api/saglik",
      "https://example.com/x.png",
      "file:///C:/Windows/win.ini",
      "file://localhost/etc/passwd",
      "ftp://x/y",
      "blob:https://x/uuid",
      "ws://x",
      "chrome://version",
      "//evil.example/x",
      "about:srcdoc",
      "javascript:alert(1)",
      "view-source:http://x",
      "",
    ]) {
      expect(istekIzinliMi(kotu), kotu).toBe(false);
    }
  });
});

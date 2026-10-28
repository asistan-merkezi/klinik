// Gerçek Chrome/Edge ile PDF üretimi: ağ/dosya erişimi kapalı mı, JavaScript çalışıyor mu, eşzamanlılık sınırı ve zaman aşımı. Sistemde Chrome/Edge yoksa atlanır
// (CHROMIUM_PATH ayarlayın). Yerel bir HTTP sunucusu "dışarı çıkma" denemelerini SAYAR: sıfır olmalı.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDF_ESZAMANLILIK, PdfZamanAsimi, chromiumVarMi, pdfDurumu, pdfUret } from "./browser";
import { PdfKuyrukDolu } from "./semafor";
import { pdfBelgesiOlustur } from "./pdf-yardimcilari";

const varMi = chromiumVarMi();
let sunucu: http.Server;
let port = 0;
let vurus: string[] = [];

beforeAll(async () => {
  sunucu = http.createServer((istek, yanit) => {
    vurus.push(istek.url ?? "");
    yanit.end("x");
  });
  await new Promise<void>((coz) => sunucu.listen(0, "127.0.0.1", () => coz()));
  port = (sunucu.address() as { port: number }).port;
});
afterAll(() => sunucu?.close());

const sade = (icerik: string) => `<!doctype html><html><body>${icerik}</body></html>`;
const pdfMi = (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-";

describe.skipIf(!varMi)("pdfUret — sertleştirilmiş Chrome", () => {
  it("gömülü içerikle geçerli bir PDF üretir (Türkçe karakter, data: görsel)", async () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const r = await pdfUret(pdfBelgesiOlustur(`<h1>Çğıöşü İĞÜ</h1><img src="${png}" alt="">`));
    expect(pdfMi(r.pdf)).toBe(true);
    expect(r.pdf.length).toBeGreaterThan(1000);
    expect(r.engellenenIstekler).toEqual([]);
  }, 60_000);

  it("SSRF: http://127.0.0.1 görseli/stili/betiği/iframe'i/yönlendirmesi istek ATAMAZ (istek yakalama katmanı; CSP'siz ham HTML)", async () => {
    vurus = [];
    const hedef = `http://127.0.0.1:${port}`;
    const html = sade(`
      <img src="${hedef}/img"><link rel="stylesheet" href="${hedef}/css"><script src="${hedef}/js"></script>
      <iframe src="${hedef}/iframe"></iframe><object data="${hedef}/obj"></object>
      <div style="background:url(${hedef}/bg)">x</div><meta http-equiv="refresh" content="0;url=${hedef}/refresh">
      <script>fetch("${hedef}/fetch"); new Image().src="${hedef}/js-img";</script>`);
    const r = await pdfUret(html);
    expect(pdfMi(r.pdf)).toBe(true);
    expect(vurus, "yerel sunucuya HİÇ istek ulaşmamalı").toEqual([]);
    expect(r.engellenenIstekler.some((u) => u.startsWith(hedef))).toBe(true); // yakalama katmanı gerçekten devreye girdi
  }, 60_000);

  it("SSRF: aynı denemeler CSP'li şablon sarmalayıcısıyla da sunucuya ulaşamaz", async () => {
    vurus = [];
    const hedef = `http://127.0.0.1:${port}`;
    await pdfUret(pdfBelgesiOlustur(`<img src="${hedef}/csp-img"><iframe src="${hedef}/csp-iframe"></iframe><link rel="stylesheet" href="${hedef}/csp-css">`));
    expect(vurus).toEqual([]);
  }, 60_000);

  it("yerel dosya okuma: file:// ile verilen YEREL görsel PDF'e girmez (aynı görsel data: ile girer — karşılaştırmalı kanıt)", async () => {
    // 96x96 rastgele gürültülü PNG (sıkıştırılamaz → PDF'e girerse boyutu belirgin artar)
    const g = 96;
    const ham = Buffer.alloc(g * (g * 3 + 1));
    for (let y = 0; y < g; y++) {
      ham[y * (g * 3 + 1)] = 0;
      for (let i = 1; i <= g * 3; i++) ham[y * (g * 3 + 1) + i] = Math.floor(Math.random() * 256);
    }
    const crcTablo = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const crc = (b: Buffer) => {
      let c = 0xffffffff;
      for (const x of b) c = crcTablo[(c ^ x) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const parca = (tip: string, veri: Buffer) => {
      const u = Buffer.alloc(4);
      u.writeUInt32BE(veri.length);
      const t = Buffer.from(tip);
      const c = Buffer.alloc(4);
      c.writeUInt32BE(crc(Buffer.concat([t, veri])));
      return Buffer.concat([u, t, veri, c]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(g, 0);
    ihdr.writeUInt32BE(g, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), parca("IHDR", ihdr), parca("IDAT", zlib.deflateSync(ham)), parca("IEND", Buffer.alloc(0))]);
    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-yerel-"));
    const dosya = path.join(dizin, "gurultu.png");
    fs.writeFileSync(dosya, png);
    try {
      const fileUrl = pathToFileURL(dosya).href;
      const yokUrl = pathToFileURL(path.join(dizin, "yok-boyle-dosya.png")).href;
      const sablon = (u: string) => sade(`<p>x</p><img src="${u}" width="200"><iframe src="${u}"></iframe><embed src="${u}"><div style="background:url(${u})">y</div>`);
      const bos = (await pdfUret(sade("<p>x</p>"))).pdf.length;
      const dataIle = (await pdfUret(sade(`<p>x</p><img src="data:image/png;base64,${png.toString("base64")}" width="200">`))).pdf.length;
      const varOlan = await pdfUret(sablon(fileUrl)); // var olan yerel dosya
      const olmayan = await pdfUret(sablon(yokUrl)); // olmayan dosya: aynı bozuk-görsel yerleşimi
      expect(dataIle - bos, "kontrol: data: görsel PDF'e GİRER").toBeGreaterThan(5_000);
      expect(Math.abs(varOlan.pdf.length - olmayan.pdf.length), "var olan dosya ile olmayan dosya AYNI sonucu verir → dosya okunmadı").toBeLessThan(150);
      expect(pdfMi(varOlan.pdf)).toBe(true);
    } finally {
      fs.rmSync(dizin, { recursive: true, force: true });
    }
  }, 120_000);

  it("JavaScript sayfada çalışmaz: betik DOM'u değiştiremez", async () => {
    vurus = [];
    const r = await pdfUret(sade(`<p id="p">ham</p><script>document.getElementById("p").textContent="betik-calisti"; new XMLHttpRequest().open("GET","http://127.0.0.1:${port}/x");</script>`));
    expect(pdfMi(r.pdf)).toBe(true);
    expect(vurus).toEqual([]);
  }, 60_000);

  it(`eşzamanlılık: aynı anda en çok ${PDF_ESZAMANLILIK} Chrome; fazlası kuyrukta bekler ve hepsi tamamlanır`, async () => {
    let enCok = 0;
    const izle = setInterval(() => (enCok = Math.max(enCok, pdfDurumu().aktif)), 15);
    try {
      const sonuclar = await Promise.all(Array.from({ length: 5 }, (_, i) => pdfUret(sade(`<p>${i}</p>`))));
      expect(sonuclar.every((s) => pdfMi(s.pdf))).toBe(true);
    } finally {
      clearInterval(izle);
    }
    expect(enCok).toBeGreaterThanOrEqual(1);
    expect(enCok).toBeLessThanOrEqual(PDF_ESZAMANLILIK);
    expect(pdfDurumu()).toEqual({ aktif: 0, bekleyen: 0 });
  }, 120_000);

  it("kuyruk dolunca (2 aktif + 8 bekleyen) fazlası PdfKuyrukDolu ile reddedilir; kabul edilenler tamamlanır", async () => {
    const iler = Array.from({ length: 12 }, (_, i) => pdfUret(sade(`<p>${i}</p>`)).then((r) => ({ ok: pdfMi(r.pdf) }), (e) => ({ hata: e })));
    const sonuc = await Promise.all(iler);
    const reddedilen = sonuc.filter((s) => "hata" in s && s.hata instanceof PdfKuyrukDolu);
    expect(reddedilen.length).toBe(2);
    expect(sonuc.filter((s) => "ok" in s && s.ok).length).toBe(10);
  }, 180_000);

  it("zaman aşımı: PdfZamanAsimi fırlatır ve Chrome süreci sonlandırılır (yuva geri döner)", async () => {
    await expect(pdfUret(sade("<p>x</p>"), { zamanAsimiMs: 1 })).rejects.toBeInstanceOf(PdfZamanAsimi);
    expect(pdfDurumu()).toEqual({ aktif: 0, bekleyen: 0 });
    // sonrasında normal çalışmaya devam eder
    expect(pdfMi((await pdfUret(sade("<p>ok</p>"))).pdf)).toBe(true);
  }, 120_000);
});

describe("Chrome yok", () => {
  it.skipIf(varMi)("Chrome/Edge bulunamazsa açık hata verir (CHROMIUM_PATH)", async () => {
    await expect(pdfUret(sade("x"))).rejects.toThrow(/CHROMIUM_PATH/);
  });
});

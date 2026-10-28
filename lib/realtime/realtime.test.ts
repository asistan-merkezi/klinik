import { describe, expect, it, vi } from "vitest";
import { Dagitici, type AboneMesaji } from "./dagitici";
import { olayCoz, tabloListesiCoz } from "./olay";
import { sseYaniti, mesajiBicimle } from "./sse";

const K1 = "11111111-1111-1111-1111-111111111111";
const K2 = "22222222-2222-2222-2222-222222222222";
const ID = "33333333-3333-3333-3333-333333333333";
const yuk = (o: Record<string, unknown>) => JSON.stringify(o);

describe("olayCoz (NOTIFY yükü sözleşmesi)", () => {
  it("yalnız {t,i,k} kabul edilir", () => {
    expect(olayCoz(yuk({ t: "randevu", i: ID, k: K1 }))).toEqual({ tablo: "randevu", id: ID, klinikId: K1 });
  });
  it("fazladan alan (veri sızıntısı riski), bilinmeyen tablo, bozuk uuid ve bozuk JSON reddedilir", () => {
    expect(olayCoz(yuk({ t: "randevu", i: ID, k: K1, durum: "geldi" }))).toBeNull();
    expect(olayCoz(yuk({ t: "randevu", i: ID, k: K1, ad: "Ayşe" }))).toBeNull();
    expect(olayCoz(yuk({ t: "hasta", i: ID, k: K1 }))).toBeNull();
    expect(olayCoz(yuk({ t: "randevu", i: "x", k: K1 }))).toBeNull();
    expect(olayCoz(yuk({ t: "randevu", i: ID }))).toBeNull();
    expect(olayCoz("{bozuk")).toBeNull();
    expect(olayCoz(undefined)).toBeNull();
    expect(olayCoz("[]")).toBeNull();
  });
  it("tabloListesiCoz: yalnız izinli tablolar; klinik parametresi diye bir şey yok", () => {
    expect([...tabloListesiCoz("randevu,randevu_talebi")!]).toEqual(["randevu", "randevu_talebi"]);
    expect(tabloListesiCoz("randevu,hasta")).toBeNull();
    expect(tabloListesiCoz("")).toBeNull();
    expect(tabloListesiCoz(null)).toBeNull();
  });
  it("istemciye giden SSE verisinde klinik kimliği ve ek alan yok", () => {
    const s = mesajiBicimle({ tur: "olay", olay: { t: "randevu", i: ID } });
    expect(s).toBe(`event: olay\ndata: {"t":"randevu","i":"${ID}"}\n\n`);
    expect(s).not.toContain(K1);
  });
});

function abone(d: Dagitici, klinikId: string, kullaniciId: string, tablolar: string[] = ["randevu"]) {
  const alinan: AboneMesaji[] = [];
  const kaldir = d.abone({ klinikId, kullaniciId, tablolar: new Set(tablolar) as never, gonder: (m) => (alinan.push(m), true) });
  return { alinan, kaldir };
}

describe("Dagitici", () => {
  it("A kliniği aboneleri B kliniğinin olayını ALMAZ; kendi olayını alır", () => {
    const d = new Dagitici();
    const a = abone(d, K1, "u1");
    const b = abone(d, K2, "u2");
    expect(d.dagit({ tablo: "randevu", id: ID, klinikId: K1 })).toBe(1);
    expect(a.alinan).toEqual([{ tur: "olay", olay: { t: "randevu", i: ID } }]);
    expect(b.alinan).toEqual([]);
  });
  it("yalnız abone olunan tablolar iletilir", () => {
    const d = new Dagitici();
    const a = abone(d, K1, "u1", ["randevu_talebi"]);
    d.dagit({ tablo: "randevu", id: ID, klinikId: K1 });
    expect(a.alinan).toEqual([]);
    d.dagit({ tablo: "randevu_talebi", id: ID, klinikId: K1 });
    expect(a.alinan).toHaveLength(1);
  });
  it("kullanıcı başına bağlantı sınırı: sınırdan sonrası null; kapanınca yer açılır; kaldır idempotent", () => {
    const d = new Dagitici(2);
    const x1 = abone(d, K1, "u1");
    abone(d, K1, "u1");
    expect(abone(d, K1, "u1").kaldir).toBeNull();
    expect(abone(d, K1, "baska").kaldir).not.toBeNull(); // başka kullanıcı etkilenmez
    x1.kaldir!();
    x1.kaldir!();
    expect(d.kullaniciAboneSayisi("u1")).toBe(1);
    expect(abone(d, K1, "u1").kaldir).not.toBeNull();
  });
  it("gönderemeyen (kapalı/yavaş) abone dağıtımda kaldırılır", () => {
    const d = new Dagitici();
    d.abone({ klinikId: K1, kullaniciId: "u1", tablolar: new Set(["randevu"]) as never, gonder: () => false });
    d.dagit({ tablo: "randevu", id: ID, klinikId: K1 });
    expect(d.toplamAbone()).toBe(0);
    expect(d.kullaniciAboneSayisi("u1")).toBe(0);
  });
  it("hepsineYeniden ve ping tüm kliniklerdeki abonelere gider", () => {
    const d = new Dagitici();
    const a = abone(d, K1, "u1");
    const b = abone(d, K2, "u2");
    d.hepsineYeniden();
    d.ping();
    expect(a.alinan.map((m) => m.tur)).toEqual(["yeniden", "ping"]);
    expect(b.alinan.map((m) => m.tur)).toEqual(["yeniden", "ping"]);
  });
});

async function oku(r: Response, n: number): Promise<string> {
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let s = "";
  while (s.split("\n\n").length - 1 < n) {
    const { value, done } = await reader.read();
    if (done) break;
    s += dec.decode(value);
  }
  reader.releaseLock();
  return s;
}

describe("sseYaniti", () => {
  it("başlıklar SSE'ye uygun; hazir olayı ve dağıtılan olay akışta görünür", async () => {
    const d = new Dagitici();
    const ac = new AbortController();
    const r = sseYaniti({ dagitici: d, klinikId: K1, kullaniciId: "u1", tablolar: new Set(["randevu"]), signal: ac.signal })!;
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    expect(r.headers.get("cache-control")).toContain("no-transform");
    d.dagit({ tablo: "randevu", id: ID, klinikId: K1 });
    d.dagit({ tablo: "randevu", id: ID, klinikId: K2 }); // başka klinik: akışa girmez
    const metin = await oku(r, 3); // retry bloğu + hazir + olay
    expect(metin).toContain("event: hazir");
    expect(metin).toContain(`event: olay\ndata: {"t":"randevu","i":"${ID}"}`);
    expect(metin).not.toContain(K1);
    ac.abort();
  });
  it("kullanıcı sınırı aşılınca null (route 429 verir); istemci kopunca (abort) abonelik düşer", () => {
    const d = new Dagitici(1);
    const ac = new AbortController();
    const mk = () => sseYaniti({ dagitici: d, klinikId: K1, kullaniciId: "u1", tablolar: new Set(["randevu"]), signal: ac.signal });
    expect(mk()).not.toBeNull();
    expect(mk()).toBeNull();
    ac.abort();
    expect(d.toplamAbone()).toBe(0);
  });
  it("bağlantı ömrü dolunca akış kapanır ve abonelik düşer (oturum yeniden doğrulansın diye)", async () => {
    vi.useFakeTimers();
    try {
      const d = new Dagitici();
      const r = sseYaniti({ dagitici: d, klinikId: K1, kullaniciId: "u1", tablolar: new Set(["randevu"]), signal: new AbortController().signal, omurMs: 1000 })!;
      expect(d.toplamAbone()).toBe(1);
      vi.advanceTimersByTime(1001);
      expect(d.toplamAbone()).toBe(0);
      const reader = r.body!.getReader();
      await reader.read(); // hazir
      expect((await reader.read()).done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("oturum denetimi (her 25 sn'lik ping'de)", () => {
    const bekleMikro = async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };
    const kur = (oturumGecerliMi: () => Promise<boolean>) => {
      const d = new Dagitici();
      const r = sseYaniti({ dagitici: d, klinikId: K1, kullaniciId: "u1", tablolar: new Set(["randevu"]), signal: new AbortController().signal, oturumGecerliMi })!;
      return { d, r };
    };
    const tumunuOku = async (r: Response) => {
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      let s = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return s;
        s += dec.decode(value);
      }
    };

    it("oturum geçerliyse her ping'de denetlenir ve bağlantı AÇIK kalır", async () => {
      const denetim = vi.fn(async () => true);
      const { d } = kur(denetim);
      d.ping();
      await bekleMikro();
      d.ping();
      await bekleMikro();
      expect(denetim).toHaveBeenCalledTimes(2);
      expect(d.toplamAbone()).toBe(1);
    });

    it("oturum geçersizse 'oturum' olayı gönderilir, akış kapanır ve abonelik düşer", async () => {
      const { d, r } = kur(async () => false);
      d.ping();
      await bekleMikro();
      expect(d.toplamAbone()).toBe(0);
      const metin = await tumunuOku(r);
      expect(metin).toContain("event: ping");
      expect(metin).toContain(`event: oturum${String.fromCharCode(10)}data: {"gecerli":false}`);
    });

    it("denetim HATA verirse (doğrulanamıyor) fail-closed: bağlantı kapanır", async () => {
      const { d, r } = kur(async () => {
        throw new Error("veritabanı yok");
      });
      d.ping();
      await bekleMikro();
      expect(d.toplamAbone()).toBe(0);
      expect(await tumunuOku(r)).toContain("event: oturum");
    });

    it("denetim sürerken gelen ikinci ping yeni denetim BAŞLATMAZ (birikme yok)", async () => {
      let coz!: (v: boolean) => void;
      const denetim = vi.fn(() => new Promise<boolean>((res) => (coz = res)));
      const { d } = kur(denetim);
      d.ping();
      d.ping();
      d.ping();
      expect(denetim).toHaveBeenCalledTimes(1);
      coz(true);
      await bekleMikro();
      d.ping();
      expect(denetim).toHaveBeenCalledTimes(2);
    });

    it("denetim yalnız ping'de çalışır; olaylarda çalışmaz; denetim verilmediyse eski davranış korunur", async () => {
      const denetim = vi.fn(async () => true);
      const { d } = kur(denetim);
      d.dagit({ tablo: "randevu", id: ID, klinikId: K1 });
      await bekleMikro();
      expect(denetim).not.toHaveBeenCalled();
      const d2 = new Dagitici();
      sseYaniti({ dagitici: d2, klinikId: K1, kullaniciId: "u1", tablolar: new Set(["randevu"]), signal: new AbortController().signal });
      d2.ping();
      await bekleMikro();
      expect(d2.toplamAbone()).toBe(1);
    });
  });
});

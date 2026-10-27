// Modül 2a: LISTEN/NOTIFY tetikleyicileri + dinleyici + dağıtıcı, gerçek Postgres'te (iki klinikli düzenek).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { Dagitici, PgDinleyici, type AboneMesaji } from "@/lib/realtime";
import { ortamKur, superBaglan, tenantdaCalistir } from "./yardimci";

let K1: Record<string, string>;
let K2: Record<string, string>;
let port: number;
let sayac = 0;

beforeAll(() => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
  port = o.port;
});

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function kosul(fn: () => boolean, ms = 8000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("koşul zaman aşımına uğradı");
    await bekle(25);
  }
}

/** Klinikte benzersiz zamanlı randevu ekler (oda/terapist çakışma kısıtı için her çağrıda farklı saat). */
async function randevuEkle(k: Record<string, string>): Promise<string> {
  const id = randomUUID();
  const n = ++sayac + 100;
  await tenantdaCalistir(k.klinik, (c) =>
    c.query(
      `insert into randevu(id, klinik_id, hasta_id, terapist_id, oda_id, baslangic, bitis)
       values ($1, $2, $3, $4, $5, now() + ($6 || ' hours')::interval, now() + ($6 || ' hours 20 minutes')::interval)`,
      [id, k.klinik, k.hasta, k.terapist, k.oda, String(n * 2)]
    )
  );
  return id;
}

describe("NOTIFY tetikleyicisi: yük yalnız {t,i,k}", () => {
  it("INSERT/UPDATE/DELETE için yük tam olarak tablo+id+klinik; hasta/sağlık verisi YOK", async () => {
    const dinle = await superBaglan();
    const yukler: string[] = [];
    dinle.on("notification", (m) => m.channel === "canli" && yukler.push(m.payload ?? ""));
    await dinle.query("LISTEN canli");
    try {
      const id = await randevuEkle(K1);
      await tenantdaCalistir(K1.klinik, (c) => c.query("update randevu set durum = 'geldi', tani = 'cok-gizli-klinik-notu' where id = $1", [id]));
      await tenantdaCalistir(K1.klinik, (c) => c.query("delete from randevu where id = $1", [id]));
      await kosul(() => yukler.length >= 3);
      for (const y of yukler) {
        const o = JSON.parse(y);
        expect(Object.keys(o).sort()).toEqual(["i", "k", "t"]);
        expect(o).toEqual({ t: "randevu", i: id, k: K1.klinik });
        expect(y).not.toContain("geldi");
        expect(y).not.toContain("cok-gizli");
        expect(y).not.toContain(K1.hasta);
      }
    } finally {
      await dinle.end();
    }
  });

  it("uygulama rolüyle (klinik_uygulama + tenant bağlamı) yapılan gerçek yazma bildirir, permission denied yok", async () => {
    const dinle = await superBaglan();
    const tablolar: string[] = [];
    dinle.on("notification", (m) => tablolar.push(JSON.parse(m.payload ?? "{}").t));
    await dinle.query("LISTEN canli");
    try {
      // gerçek yazma yolu: klinik_uygulama rolü + tenant bağlamı (uygulamadaki gibi)
      const c = new pg.Client({ host: "localhost", port, user: "klinik_uygulama", password: "u-deneme", database: "klinik" });
      await c.connect();
      try {
        await c.query("BEGIN");
        await c.query("select set_config('app.user_id', $1, true), set_config('app.tenant_id', $2, true)", [K1.kullanici, K1.klinik]);
        await c.query("update randevu set tani = 'x' where id = $1", [K1.randevu]);
        await c.query("COMMIT");
      } finally {
        await c.end();
      }
      await kosul(() => tablolar.includes("randevu"));
    } finally {
      await dinle.end();
    }
  });
});

describe("PgDinleyici + Dagitici (gerçek Postgres)", () => {
  let dagitici: Dagitici;
  let dinleyici: PgDinleyici;
  const a: AboneMesaji[] = [];
  const b: AboneMesaji[] = [];
  const olaylar = (m: AboneMesaji[]) => m.filter((x) => x.tur === "olay");

  beforeAll(async () => {
    dagitici = new Dagitici();
    dinleyici = new PgDinleyici(dagitici, { baglantiAdresi: `postgres://klinik_uygulama:u-deneme@localhost:${port}/klinik`, ilkBekleMs: 50, enFazlaBekleMs: 200, log: { warn: () => {}, error: () => {} } });
    dagitici.abone({ klinikId: K1.klinik, kullaniciId: "ua", tablolar: new Set(["randevu"]), gonder: (m) => (a.push(m), true) });
    dagitici.abone({ klinikId: K2.klinik, kullaniciId: "ub", tablolar: new Set(["randevu"]), gonder: (m) => (b.push(m), true) });
    dinleyici.baslat();
    await kosul(() => dinleyici.baglantiSayisi === 1);
  });
  afterAll(async () => {
    await dinleyici.durdur();
  });

  it("klinik A'daki değişiklik YALNIZ A abonesine gider, B almaz (ve tersi)", async () => {
    const idA = await randevuEkle(K1);
    await kosul(() => olaylar(a).length >= 1);
    await bekle(300);
    expect(olaylar(a)).toContainEqual({ tur: "olay", olay: { t: "randevu", i: idA } });
    expect(olaylar(b)).toHaveLength(0);
    const idB = await randevuEkle(K2);
    await kosul(() => olaylar(b).length >= 1);
    expect(olaylar(b)).toContainEqual({ tur: "olay", olay: { t: "randevu", i: idB } });
    expect(olaylar(a).some((m) => m.tur === "olay" && m.olay.i === idB)).toBe(false);
  });

  it("dinleyici bağlantısı koparılınca yeniden bağlanır, aboneler 'yeniden' (telafi) mesajı alır, sonraki olaylar yine gelir", async () => {
    const sup = await superBaglan();
    try {
      const onceki = dinleyici.baglantiSayisi;
      a.length = 0;
      b.length = 0;
      await sup.query("select pg_terminate_backend(pid) from pg_stat_activity where application_name = 'klinik-canli-dinleyici'");
      await kosul(() => dinleyici.baglantiSayisi === onceki + 1);
      await kosul(() => a.some((m) => m.tur === "yeniden") && b.some((m) => m.tur === "yeniden"));
      const id = await randevuEkle(K1);
      await kosul(() => olaylar(a).some((m) => m.tur === "olay" && m.olay.i === id));
    } finally {
      await sup.end();
    }
  });

  it("sözleşmeye uymayan NOTIFY yükü (fazladan alan / bilinmeyen tablo) dağıtılmaz", async () => {
    const sup = await superBaglan();
    try {
      a.length = 0;
      await sup.query("select pg_notify('canli', $1)", [JSON.stringify({ t: "randevu", i: randomUUID(), k: K1.klinik, ad: "Ayşe" })]);
      await sup.query("select pg_notify('canli', $1)", [JSON.stringify({ t: "hasta", i: randomUUID(), k: K1.klinik })]);
      await sup.query("select pg_notify('canli', 'bozuk')");
      await bekle(400);
      expect(olaylar(a)).toHaveLength(0);
    } finally {
      await sup.end();
    }
  });
});

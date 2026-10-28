// Seçenek A: tenant (ve rol) DB tarafında kullanıcının kendi kaydından türetilir; app.tenant_id yalnız super_admin / klinik_anonim / sistem bağlamında geçerli.
// Bu testler SAHTE bağlamı bilerek ham SQL ile kurar (uygulama kodu damgalı bağlamla bunu yapamaz; DB'nin kendi savunmasını sınıyoruz).
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { ortamKur, personelKur, hastaKur, superBaglan, tenantdaCalistir } from "./yardimci";

let K1: Record<string, string>;
let K2: Record<string, string>;
let port: number;

beforeAll(() => {
  const o = ortamKur();
  K1 = o.ids.k1;
  K2 = o.ids.k2;
  port = o.port;
});

type Bag = { user?: string | null; tenant?: string | null; role?: string | null };
/** klinik_uygulama bağlantısıyla ham bağlam kurup sorgular; her zaman ROLLBACK. */
async function ham<T = Record<string, unknown>>(bag: Bag, sql: string, kullanici = "klinik_uygulama", sifre = "u-deneme"): Promise<{ satirlar: T[]; hata?: string }> {
  const c = new pg.Client({ host: "localhost", port, user: kullanici, password: sifre, database: "klinik" });
  await c.connect();
  try {
    await c.query("BEGIN");
    if (bag.user !== undefined) await c.query("select set_config('app.user_id', $1, true)", [bag.user ?? ""]);
    if (bag.tenant !== undefined) await c.query("select set_config('app.tenant_id', $1, true)", [bag.tenant ?? ""]);
    if (bag.role) await c.query(`SET LOCAL ROLE ${bag.role}`);
    const r = await c.query(sql);
    return { satirlar: r.rows as T[] };
  } catch (e) {
    return { satirlar: [], hata: (e as Error).message };
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end();
  }
}
const say = async (bag: Bag, tablo = "hasta", kosul = "true") => Number((await ham<{ n: string }>(bag, `select count(*) n from ${tablo} where ${kosul}`)).satirlar[0]?.n ?? -1);
const tenantNe = async (bag: Bag, kullanici?: string, sifre?: string) => (await ham<{ t: string | null }>(bag, "select current_klinik_id() t", kullanici, sifre)).satirlar[0]?.t ?? null;

describe("oturumlu kullanıcı: app.tenant_id YOK SAYILIR", () => {
  it("K1 kullanıcısı tenant GUC'unu K2 yapsa da K1 görür; K2 satırı okunamaz/yazılamaz", async () => {
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    expect(await tenantNe({ user: p.id, tenant: K2.klinik })).toBe(K1.klinik);
    expect(await tenantNe({ user: p.id, tenant: null })).toBe(K1.klinik); // GUC hiç verilmese de türetilir
    expect(await say({ user: p.id, tenant: K2.klinik }, "hasta", `klinik_id = '${K2.klinik}'`)).toBe(0);
    expect(await say({ user: p.id, tenant: K2.klinik }, "hasta", `klinik_id = '${K1.klinik}'`)).toBeGreaterThan(0);
    const yaz = await ham({ user: p.id, tenant: K2.klinik }, `insert into hasta(klinik_id, ad_soyad, telefon) values ('${K2.klinik}', 'Sızıntı', '5559998877')`);
    expect(yaz.hata).toMatch(/row-level security/i);
  });

  it("eşlemesi olmayan (sahte/silinmiş) kullanıcı kimliği: tenant yok, 0 satır", async () => {
    const sahte = randomUUID();
    expect(await tenantNe({ user: sahte, tenant: K1.klinik })).toBeNull();
    expect(await say({ user: sahte, tenant: K1.klinik })).toBe(0);
    expect(await say({ user: sahte, tenant: K1.klinik }, "klinik")).toBe(0);
  });

  it("kullanıcısız klinik_uygulama bağlantısı tenant GUC'u ile tenant KAZANAMAZ (politikası rol istemeyen tablolar dahil)", async () => {
    expect(await tenantNe({ tenant: K1.klinik })).toBeNull();
    expect(await say({ tenant: K1.klinik }, "klinik")).toBe(0);
    expect(await say({ tenant: K1.klinik }, "hasta")).toBe(0);
    expect(await say({ user: null, tenant: K1.klinik }, "oda")).toBe(0);
  });

  it("hasta portal kullanıcısı: tenant hasta eşlemesinden; pasifleştirilince tenant ve hasta kimliği kaybolur", async () => {
    const h = await hastaKur({ klinikId: K1.klinik });
    expect(await tenantNe({ user: h.kullaniciId, tenant: K2.klinik })).toBe(K1.klinik);
    expect((await ham<{ h: string }>({ user: h.kullaniciId }, "select current_hasta_id() h")).satirlar[0].h).toBe(h.hastaId);
    const sup = await superBaglan();
    try {
      await sup.query("BEGIN");
      await sup.query("select set_config('app.tenant_id', $1, true)", [K1.klinik]);
      await sup.query("update hasta_kullanici set aktif = false where id = $1", [h.kullaniciId]);
      await sup.query("COMMIT");
    } finally {
      await sup.end();
    }
    expect(await tenantNe({ user: h.kullaniciId })).toBeNull();
    expect((await ham<{ h: string | null }>({ user: h.kullaniciId }, "select current_hasta_id() h")).satirlar[0].h).toBeNull();
  });
});

describe("super_admin, tanima (klinik_anonim) ve bakım bağlamı istisnaları", () => {
  it("super_admin: app.tenant_id YALNIZ aktif destek bağlamı olan klinik için geçerli (0015); süresi dolmuş/kapatılmış/başka klinik/GUC yok → tenant yok", async () => {
    const sa = randomUUID();
    const sup = await superBaglan();
    try {
      await sup.query("insert into kimlik_kullanici(id, eposta) values ($1, $2)", [sa, `sa-${sa}@deneme.test`]);
      await sup.query("insert into kullanici(id, klinik_id, rol, ad_soyad) values ($1, null, 'super_admin', 'SA')", [sa]);
      // bağlam YOK: GUC verilse bile tenant yok
      expect(await tenantNe({ user: sa, tenant: K1.klinik })).toBeNull();
      expect(await tenantNe({ user: sa })).toBeNull();
      // aktif bağlam (K1): yalnız K1
      await sup.query("insert into destek_baglami(kullanici_id, klinik_id, gerekce, bitis) values ($1, $2, 'test: destek incelemesi', now() + interval '30 minutes')", [sa, K1.klinik]);
      expect(await tenantNe({ user: sa, tenant: K1.klinik })).toBe(K1.klinik);
      expect(await tenantNe({ user: sa, tenant: K2.klinik })).toBeNull();
      expect(await tenantNe({ user: sa })).toBeNull();
      expect(await say({ user: sa, tenant: K1.klinik }, "hasta", `klinik_id = '${K1.klinik}'`)).toBeGreaterThan(0);
      // süre dolunca ya da kapatılınca bağlam kendiliğinden düşer (DB düzeyinde)
      await sup.query("update destek_baglami set baslangic = now() - interval '2 hours', bitis = now() - interval '1 hour' where kullanici_id = $1", [sa]);
      expect(await tenantNe({ user: sa, tenant: K1.klinik })).toBeNull();
      await sup.query("insert into destek_baglami(kullanici_id, klinik_id, gerekce, bitis, kapatildi) values ($1, $2, 'test: kapatılmış bağlam', now() + interval '30 minutes', now())", [sa, K2.klinik]);
      expect(await tenantNe({ user: sa, tenant: K2.klinik })).toBeNull();
    } finally {
      await sup.end();
    }
  });

  it("klinik_anonim (tanima sonrası): kullanıcısız GUC geçerli; kullanıcı VARSA türetme kazanır", async () => {
    expect(await tenantNe({ tenant: K1.klinik, role: "klinik_anonim" })).toBe(K1.klinik);
    expect(await tenantNe({ role: "klinik_anonim" })).toBeNull();
    const p = await personelKur({ klinikId: K2.klinik, rol: "resepsiyon" });
    expect(await tenantNe({ user: p.id, tenant: K1.klinik, role: "klinik_anonim" })).toBe(K2.klinik);
  });

  it("bakım bağlamı: bakim_rolu tenant GUC'unu kullanır; klinik_uygulama'ya geçince de bağlam sürer", async () => {
    expect(await tenantNe({ tenant: K1.klinik }, "bakim_rolu", "b-deneme")).toBe(K1.klinik);
    expect(await tenantNe({ tenant: K2.klinik, role: "klinik_uygulama" }, "bakim_rolu", "b-deneme")).toBe(K2.klinik);
    // bakim_rolu bağlantısı + SET LOCAL ROLE klinik_uygulama + tenant K1: yalnız K1 satırları (klinik başına iş akışı)
    const k1 = (await ham<{ n: string }>({ tenant: K1.klinik, user: null, role: "klinik_uygulama" }, `select count(*) n from hasta where klinik_id = '${K1.klinik}'`, "bakim_rolu", "b-deneme")).satirlar[0].n;
    const k2 = (await ham<{ n: string }>({ tenant: K1.klinik, user: null, role: "klinik_uygulama" }, `select count(*) n from hasta where klinik_id = '${K2.klinik}'`, "bakim_rolu", "b-deneme")).satirlar[0].n;
    expect(Number(k1)).toBeGreaterThan(0);
    expect(Number(k2)).toBe(0);
  });

  it("süper kullanıcı oturumu (kurulum/sağlama) tenant GUC'unu kullanır", async () => {
    const sup = await superBaglan();
    try {
      await sup.query("BEGIN");
      await sup.query("select set_config('app.tenant_id', $1, true)", [K1.klinik]);
      expect((await sup.query("select current_klinik_id() t")).rows[0].t).toBe(K1.klinik);
      await sup.query("ROLLBACK");
    } finally {
      await sup.end();
    }
  });
});

describe("eşleme tablosu tutarlılığı ve yetkileri", () => {
  it("kullanicinin klinik_id'si / rolü güncellenince ve silinince eşleme tutarlı kalır", async () => {
    const p = await personelKur({ klinikId: K1.klinik, rol: "resepsiyon" });
    expect(await tenantNe({ user: p.id })).toBe(K1.klinik);
    expect((await ham<{ r: string }>({ user: p.id }, "select current_rol()::text r")).satirlar[0].r).toBe("resepsiyon");
    const sup = await superBaglan();
    try {
      await sup.query("update kullanici set klinik_id = $2, rol = 'terapist' where id = $1", [p.id, K2.klinik]);
      let esleme = (await sup.query("select klinik_id, rol::text rol from kullanici_tenant where kullanici_id = $1", [p.id])).rows[0];
      expect(esleme).toEqual({ klinik_id: K2.klinik, rol: "terapist" });
      expect(await tenantNe({ user: p.id })).toBe(K2.klinik);
      expect((await ham<{ r: string }>({ user: p.id }, "select current_rol()::text r")).satirlar[0].r).toBe("terapist");
      expect((await ham<{ s: boolean }>({ user: p.id }, "select is_super_admin() s")).satirlar[0].s).toBe(false);
      await sup.query("delete from kullanici where id = $1", [p.id]);
      expect((await sup.query("select count(*)::int n from kullanici_tenant where kullanici_id = $1", [p.id])).rows[0].n).toBe(0);
      esleme = undefined as never;
    } finally {
      await sup.end();
    }
    expect(await tenantNe({ user: p.id })).toBeNull();
    expect(await say({ user: p.id })).toBe(0);
  });

  it("klinik silinince (CASCADE) kullanıcı eşlemeleri de silinir", async () => {
    const klinik = randomUUID();
    const kullanici = randomUUID();
    const sup = await superBaglan();
    try {
      await sup.query("BEGIN");
      await sup.query("select set_config('app.tenant_id', $1, true)", [klinik]);
      await sup.query("insert into klinik(id, ad, qr_kisa_kod) values ($1, 'gecici', $2)", [klinik, `gecici-${klinik.slice(0, 8)}`]);
      await sup.query("insert into kimlik_kullanici(id, eposta) values ($1, $2)", [kullanici, `g-${kullanici}@deneme.test`]);
      await sup.query("insert into kullanici(id, klinik_id, rol, ad_soyad) values ($1, $2, 'klinik_admin', 'G')", [kullanici, klinik]);
      expect((await sup.query("select count(*)::int n from kullanici_tenant where kullanici_id = $1", [kullanici])).rows[0].n).toBe(1);
      await sup.query("delete from klinik where id = $1", [klinik]);
      expect((await sup.query("select count(*)::int n from kullanici_tenant where kullanici_id = $1", [kullanici])).rows[0].n).toBe(0);
      await sup.query("COMMIT");
    } finally {
      await sup.end();
    }
  });

  it("klinik_uygulama, klinik_anonim, bakim_rolu, kimlik_rolu eşleme tablosuna HİÇBİR yetkiye sahip değil; doğrudan yazma denemeleri reddedilir", async () => {
    const sup = await superBaglan();
    try {
      for (const rol of ["klinik_uygulama", "klinik_anonim", "bakim_rolu", "kimlik_rolu", "klinik_tanima"]) {
        const r = await sup.query(`select has_any_column_privilege($1, 'kullanici_tenant', 'SELECT,INSERT,UPDATE,REFERENCES') a, has_table_privilege($1, 'kullanici_tenant', 'DELETE') d`, [rol]);
        expect(r.rows[0], rol).toEqual({ a: false, d: false });
      }
    } finally {
      await sup.end();
    }
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    for (const sql of [
      `insert into kullanici_tenant(kullanici_id, tur, klinik_id, rol) values ('${randomUUID()}', 'personel', '${K2.klinik}', 'klinik_admin')`,
      `update kullanici_tenant set klinik_id = '${K2.klinik}' where kullanici_id = '${p.id}'`,
      `delete from kullanici_tenant`,
      "select * from kullanici_tenant",
    ]) {
      expect((await ham({ user: p.id }, sql)).hata, sql).toMatch(/permission denied/i);
    }
    expect((await ham({ tenant: K1.klinik, role: "klinik_anonim" }, "select * from kullanici_tenant")).hata).toMatch(/permission denied/i);
  });

  it("başka kliniğin hastası için portal hesabı açılamaz (eşleme tetikleyicisi tenant'ı doğrular)", async () => {
    const k2hasta = K2.hasta;
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    const kimlik = randomUUID();
    const sup = await superBaglan();
    try {
      await sup.query("insert into kimlik_kullanici(id, eposta, tur, klinik_id, hasta_id) values ($1, $2, 'hasta', $3, $4)", [kimlik, `x-${kimlik}@deneme.test`, K2.klinik, k2hasta]);
    } finally {
      await sup.end();
    }
    // K1 yöneticisi, K2'nin hastasına bağlanan hasta_kullanici satırı eklemeye çalışır: RLS hasta satırını göstermez -> hasta_bulunamadi
    const r = await ham({ user: p.id }, `insert into hasta_kullanici(id, hasta_id) values ('${kimlik}', '${k2hasta}')`);
    expect(r.hata).toMatch(/hasta_bulunamadi|row-level security|permission denied/i);
    void tenantdaCalistir;
  });
});

describe("FORCE RLS özyinelemesi yok", () => {
  it("kullanici ve hasta_kullanici politikaları eşleme tablosundan geçtiği için derinlik hatası vermez", async () => {
    const p = await personelKur({ klinikId: K1.klinik, rol: "klinik_admin" });
    for (const t of ["kullanici", "hasta_kullanici", "hasta", "klinik", "randevu"]) {
      const r = await ham({ user: p.id }, `select count(*) from ${t}`);
      expect(r.hata, t).toBeUndefined();
    }
    const plan = await ham<Record<string, string>>({ user: p.id }, "explain select * from kullanici");
    expect(plan.hata).toBeUndefined();
  });
});

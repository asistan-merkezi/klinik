// klinik_migrasyon (migration uygulayıcı) ve migrasyon şeması: süper kullanıcı yerine geçen dar rol. deploy/windows/migrasyon-uygula.ps1 bu rolle bağlanır.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { ortamKur, superBaglan } from "./yardimci";

let port: number;
let m: pg.Client;

async function hata(c: pg.Client, sorgu: string): Promise<string> {
  try {
    await c.query(sorgu);
  } catch (e) {
    return (e as Error).message;
  } finally {
    await c.query("ROLLBACK").catch(() => {});
  }
  return "";
}

beforeAll(async () => {
  ({ port } = ortamKur());
  m = new pg.Client({ host: "localhost", port, user: "klinik_migrasyon", password: "m-deneme", database: "klinik" });
  await m.connect();
});
afterAll(async () => {
  await m.end();
});

describe("klinik_migrasyon: dar yetki", () => {
  it("kendi başına hiçbir veriyi okuyamaz; migrasyon şemasını göremez", async () => {
    expect(await hata(m, "select count(*) from hasta")).toMatch(/permission denied/);
    expect(await hata(m, "select count(*) from kimlik_kullanici")).toMatch(/permission denied/);
    expect(await hata(m, "select * from migrasyon.kayit")).toMatch(/permission denied/);
  });

  it("süper kullanıcı işi yapamaz: rol/veritabanı/eklenti oluşturamaz, süper kullanıcıya geçemez", async () => {
    expect(await hata(m, "create role zz_x")).toMatch(/permission denied/);
    expect(await hata(m, "create database zz_x")).toMatch(/permission denied/);
    expect(await hata(m, "create extension if not exists dblink")).toMatch(/permission denied|must be superuser/);
    expect(await hata(m, "set role postgres")).toMatch(/permission denied/);
    expect(await hata(m, "set role klinik_yedek")).toMatch(/permission denied/);
    expect(await hata(m, "set role klinik_uygulama")).toMatch(/permission denied/);
  });

  it("klinik_sahip olarak şema değiştirir ve kayıt yazar, ama tenant verisini RLS yüzünden GÖRMEZ (BYPASSRLS yok)", async () => {
    await m.query("BEGIN");
    try {
      await m.query("SET ROLE klinik_sahip");
      await m.query("create table zz_migrasyon_deneme (a int)");
      await m.query("insert into migrasyon.kayit(dosya, sha256) values ('zz-deneme.sql', 'x')");
      expect((await m.query("select count(*)::int n from migrasyon.kayit where dosya = 'zz-deneme.sql'")).rows[0].n).toBe(1);
      expect((await m.query("select count(*)::int n from hasta")).rows[0].n).toBe(0); // tenant bağlamı yok → FORCE RLS
    } finally {
      await m.query("ROLLBACK");
    }
  });

  it("dosya başına atomiklik: ortada hata → tablo da kayıt satırı da kalmaz", async () => {
    await m.query("BEGIN");
    await m.query("SET ROLE klinik_sahip");
    await m.query("create table zz_yari_migrasyon (a int)");
    await expect(m.query("insert into zz_olmayan_tablo values (1)")).rejects.toThrow();
    await m.query("ROLLBACK");
    const s = await superBaglan();
    try {
      expect((await s.query("select to_regclass('zz_yari_migrasyon') r")).rows[0].r).toBeNull();
      expect((await s.query("select count(*)::int n from migrasyon.kayit where dosya like 'zz-%'")).rows[0].n).toBe(0);
    } finally {
      await s.end();
    }
  });

  it("uygulama rolleri migrasyon şemasına erişemez", async () => {
    for (const [rol, sifre] of [["klinik_uygulama", "u-deneme"], ["bakim_rolu", "b-deneme"], ["kimlik_rolu", "k-deneme"]] as const) {
      const c = new pg.Client({ host: "localhost", port, user: rol, password: sifre, database: "klinik" });
      await c.connect();
      try {
        expect(await hata(c, "select * from migrasyon.kayit"), rol).toMatch(/permission denied/);
      } finally {
        await c.end();
      }
    }
  });
});

describe("kontrol SQL'leri: yeni kurallar ihlali yakalar", () => {
  const kontrolSql = (dosya: string) =>
    fs.readFileSync(path.join(process.cwd(), "db/kontrol", dosya), "utf8").split("\n").filter((s) => !s.startsWith("\\")).join("\n");

  async function calistir(dosya: string, once: string[] = []): Promise<string> {
    const s = await superBaglan();
    try {
      await s.query("BEGIN");
      for (const q of once) await s.query(q);
      await s.query("SAVEPOINT kontrol_once");
      try {
        await s.query(kontrolSql(dosya));
        return "";
      } catch (e) {
        // Hangi satırın ihlal sayıldığı hata mesajında görünsün (CI'da psql çıktısı yok): son DO bloğunu atlayıp HATA satırlarını oku.
        let ek = "";
        try {
          await s.query("ROLLBACK TO SAVEPOINT kontrol_once");
          await s.query(kontrolSql(dosya).replace(/DO \$\$\s*DECLARE[\s\S]*$/, ""));
          const satirlar = (await s.query("select kontrol, ayrinti from kontrol_sonuc where durum = 'HATA'")).rows;
          ek = ` | HATA satırları: ${JSON.stringify(satirlar)}`;
        } catch {
          /* ayrıntı alınamazsa asıl mesaj yeter */
        }
        return (e as Error).message + ek;
      }
    } finally {
      await s.query("ROLLBACK").catch(() => {});
      await s.end();
    }
  }

  it("temiz kurulumda yetki-matrisi ve bypassrls kontrolü geçer", async () => {
    expect(await calistir("yetki-matrisi.sql")).toBe("");
    expect(await calistir("bypassrls-kontrol.sql")).toBe("");
  });

  it("migrasyon şemasına uygulama rolü yetkisi verilirse yetki-matrisi HATA verir", async () => {
    expect(await calistir("yetki-matrisi.sql", ["grant usage on schema migrasyon to klinik_uygulama"])).toMatch(/yetki-matrisi: \d+ ihlal/);
  });

  it("klinik_migrasyon'a doğrudan tablo yetkisi ya da fazladan rol üyeliği verilirse HATA verir", async () => {
    expect(await calistir("yetki-matrisi.sql", ["grant select on klinik to klinik_migrasyon"])).toMatch(/ihlal/);
    expect(await calistir("yetki-matrisi.sql", ["grant klinik_uygulama to klinik_migrasyon"])).toMatch(/ihlal/);
    expect(await calistir("yetki-matrisi.sql", ["grant klinik_sahip to klinik_migrasyon with inherit true"])).toMatch(/ihlal/);
  });

  it("klinik_migrasyon süper kullanıcı/BYPASSRLS yapılırsa bypassrls-kontrol HATA verir", async () => {
    expect(await calistir("bypassrls-kontrol.sql", ["alter role klinik_migrasyon bypassrls"])).toMatch(/bypassrls-kontrol: \d+ HATA/);
  });

  it("klinik_id'li bir tabloda zorunlu_tenant_siniri politikası silinirse (ya da yeni tabloya eklenmezse) bypassrls-kontrol HATA verir", async () => {
    expect(await calistir("bypassrls-kontrol.sql", ["drop policy zorunlu_tenant_siniri on hasta"])).toMatch(/bypassrls-kontrol: \d+ HATA/);
    expect(await calistir("bypassrls-kontrol.sql", ["create table zz_yeni_tenant_tablosu (id int, klinik_id uuid not null); alter table zz_yeni_tenant_tablosu enable row level security; alter table zz_yeni_tenant_tablosu force row level security"])).toMatch(/bypassrls-kontrol: \d+ HATA/);
  });
});

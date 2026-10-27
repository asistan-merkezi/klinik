// Tenant izolasyonu ve rol sınırları (gerçek Postgres, iki klinikli düzenek).
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { kullaniciBaglami, ortamKur, reddedilmeli, tenantBaglami, tenantdaCalistir } from "./yardimci";
import { tenantBaglamiUret } from "@/lib/db/baglam-uretici";

let K1: { klinik: string; kullanici: string; hasta: string };
let K2: { klinik: string; kullanici: string; hasta: string };

beforeAll(() => {
  const { ids } = ortamKur();
  K1 = ids.k1 as typeof K1;
  K2 = ids.k2 as typeof K2;
});

describe("withTenant izolasyonu", () => {
  it("tenant A kullanıcısı yalnız kendi hastalarını görür, B'nin verisini göremez", async () => {
    const { withTenant, sema } = await import("@/lib/db");
    const a = await withTenant(tenantBaglami(K1), (tx) => tx.select({ id: sema.hasta.id, klinik: sema.hasta.klinikId }).from(sema.hasta));
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((h) => h.klinik === K1.klinik)).toBe(true);
    expect(a.some((h) => h.id === K2.hasta)).toBe(false);
    const b = await withTenant(tenantBaglami(K1), (tx) => tx.select().from(sema.hasta).where(eq(sema.hasta.id, K2.hasta)));
    expect(b).toHaveLength(0);
  });

  it("tenant A, B kliniğine yazamaz (RLS WITH CHECK) ve B'nin satırını güncelleyemez/silemez", async () => {
    const { withTenant, sema } = await import("@/lib/db");
    const ctx = tenantBaglami(K1);
    await reddedilmeli(withTenant(ctx, (tx) => tx.insert(sema.hasta).values({ klinikId: K2.klinik, adSoyad: "Sızıntı", telefon: "5550001111" })), /row-level security/i);
    const guncel = await withTenant(ctx, (tx) => tx.update(sema.hasta).set({ adSoyad: "Ele geçirildi" }).where(eq(sema.hasta.id, K2.hasta)).returning({ id: sema.hasta.id }));
    expect(guncel).toHaveLength(0);
    // (hasta artık hiçbir akışta silinmez → DELETE yetkisi yok; silme yetkisi olan `klinik_arac` ile sınanır)
    const aracId = crypto.randomUUID();
    await tenantdaCalistir(K2.klinik, (c) => c.query("insert into klinik_arac(id, klinik_id, marka, model, plaka) values ($1, $2, 'X', 'Y', '34 ZZ 999')", [aracId, K2.klinik]));
    const silinen = await withTenant(ctx, (tx) => tx.delete(sema.klinikArac).where(eq(sema.klinikArac.id, aracId)).returning({ id: sema.klinikArac.id }));
    expect(silinen).toHaveLength(0);
  });

  it("bağlam yokken (withGlobal) tenant tablolarından 0 satır döner", async () => {
    const { withGlobal, sema } = await import("@/lib/db");
    expect(await withGlobal((tx) => tx.select().from(sema.hasta))).toHaveLength(0);
    expect(await withGlobal((tx) => tx.select().from(sema.klinik))).toHaveLength(0);
    expect(await withGlobal((tx) => tx.select().from(sema.randevu))).toHaveLength(0);
  });

  it("yalnız kullanıcı bağlamı (tenant verilmeden): tenant kullanıcının kendi kaydından türetilir, başka kliniğin kullanıcısı görünmez", async () => {
    const { withKullanici, sema } = await import("@/lib/db");
    const satirlar = await withKullanici(kullaniciBaglami(K1.kullanici), (tx) => tx.select({ id: sema.kullanici.id, klinik: sema.kullanici.klinikId }).from(sema.kullanici));
    expect(satirlar.map((s) => s.id)).toContain(K1.kullanici);
    expect(satirlar.every((s) => s.klinik === K1.klinik)).toBe(true);
    expect(satirlar.map((s) => s.id)).not.toContain(K2.kullanici);
  });

  it("bağlam yalnız damgalı üreticiyle kurulur: düz nesne (as ile zorlansa bile), geçersiz biçim ve boş değer reddedilir", async () => {
    const { withTenant, withKullanici, withAnonim, GecersizBaglamHatasi } = await import("@/lib/db");
    // çalışma zamanı: tipi aşılmış (as never) düz nesne damgasız -> reddedilir
    await expect(withTenant({ userId: K1.kullanici, tenantId: K1.klinik } as never, async () => 1)).rejects.toBeInstanceOf(GecersizBaglamHatasi);
    await expect(withKullanici({ userId: K1.kullanici } as never, async () => 1)).rejects.toBeInstanceOf(GecersizBaglamHatasi);
    await expect(withAnonim({ tenantId: K1.klinik } as never, async () => 1)).rejects.toBeInstanceOf(GecersizBaglamHatasi);
    // üretici: enjeksiyon / boş / yanlış tip
    expect(() => tenantBaglamiUret({ userId: "x'; drop table hasta;--", tenantId: K1.klinik })).toThrowError(GecersizBaglamHatasi);
    expect(() => tenantBaglamiUret({ userId: K1.kullanici, tenantId: "" })).toThrowError(GecersizBaglamHatasi);
    // damgalı nesne dondurulmuştur: sonradan değiştirilemez
    const b = tenantBaglamiUret({ userId: K1.kullanici, tenantId: K1.klinik });
    expect(() => {
      (b as { tenantId: string }).tenantId = K2.klinik;
    }).toThrow();
  });

  it("bağlam transaction bitince kaybolur (havuzdaki sonraki istege sızmaz)", async () => {
    const { withTenant, withGlobal, sema, sql } = await import("@/lib/db");
    await withTenant(tenantBaglami(K1), (tx) => tx.select().from(sema.hasta));
    for (let i = 0; i < 12; i++) {
      const r = await withGlobal((tx) => tx.execute(sql`select current_setting('app.tenant_id', true) as t, current_setting('app.user_id', true) as u`));
      const satir = r.rows[0] as { t: string | null; u: string | null };
      expect(satir.t ?? "").toBe("");
      expect(satir.u ?? "").toBe("");
    }
  });
});

describe("uygulama rolünün kimlik tablolarına erişimi yok", () => {
  it.each(["kimlik_kullanici", "kimlik_hesap", "oturum", "kimlik_dogrulama"])("klinik_uygulama %s tablosunu okuyamaz/yazamaz", async (tablo) => {
    const { withTenant, sql } = await import("@/lib/db");
    const ctx = tenantBaglami(K1);
    await reddedilmeli(withTenant(ctx, (tx) => tx.execute(sql.raw(`select * from ${tablo} limit 1`))), /permission denied/i);
    await reddedilmeli(withTenant(ctx, (tx) => tx.execute(sql.raw(`delete from ${tablo}`))), /permission denied/i);
  });

  it("anonim rol (withTanima) kimlik ve tenant tablolarını okuyamaz, yalnız tanima fonksiyonu çalışır", async () => {
    const { withTanima, sql } = await import("@/lib/db");
    await reddedilmeli(withTanima((tx) => tx.execute(sql`select * from kimlik_kullanici`)), /permission denied/i);
    await reddedilmeli(withTanima((tx) => tx.execute(sql`select * from hasta`)), /permission denied/i);
    const r = await withTanima((tx) => tx.execute(sql`select id from tanima.klinik_qr_bilgisi_getir('klinikbir')`));
    expect(r.rows).toHaveLength(1);
  });
});

describe("bakım yardımcısı", () => {
  it("bakim_rolu klinik listesini alır, iş klinik başına yalnız o klinik bağlamında çalışır", async () => {
    const { bakimKlinikleriniDolas } = await import("@/lib/db/bakim");
    const { sema } = await import("@/lib/db");
    const sonuc = await bakimKlinikleriniDolas(async (tx, klinik) => {
      const hastalar = await tx.select({ klinik: sema.hasta.klinikId }).from(sema.hasta);
      return { klinik: klinik.id, hastaSayisi: hastalar.length, baskaKlinik: hastalar.some((h) => h.klinik !== klinik.id) };
    });
    expect(sonuc.length).toBeGreaterThanOrEqual(2);
    for (const s of sonuc) {
      expect(s.ok).toBe(true);
      if (s.ok) {
        expect(s.sonuc.baskaKlinik).toBe(false);
        expect(s.sonuc.klinik).toBe(s.klinikId);
      }
    }
  });

  it("bakim_rolu doğrudan tenant tablosu okuyamaz ve BYPASSRLS değildir", async () => {
    const pg = (await import("pg")).default;
    const c = new pg.Client({ connectionString: process.env.BAKIM_DATABASE_URL });
    await c.connect();
    try {
      await expect(c.query("select * from hasta")).rejects.toThrow(/permission denied/i);
      await expect(c.query("select * from kimlik_kullanici")).rejects.toThrow(/permission denied/i);
      const r = await c.query("select rolbypassrls, rolsuper from pg_roles where rolname = current_user");
      expect(r.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    } finally {
      await c.end();
    }
  });
});

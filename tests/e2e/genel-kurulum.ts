// Playwright globalSetup: iki klinikli test Postgres'ini kurar ve tarayıcı testleri için hesapları oluşturur (tests/e2e/.hesaplar.json).
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { hastaHesabiOlustur, personelHesabiOlustur } from "../../lib/auth/hesap";

type Duzenek = { kume: { port: number }; ids: Record<string, Record<string, string>>; durdur: () => Promise<void> };

export default async function kur() {
  const { testKumesiKur } = (await import("../../scripts/dev/test-kur.mjs")) as unknown as { testKumesiKur: () => Promise<Duzenek> };
  const duzenek = await testKumesiKur();
  const port = duzenek.kume.port;
  process.env.KIMLIK_DATABASE_URL = `postgres://kimlik_rolu:k-deneme@localhost:${port}/klinik`;
  const K1 = duzenek.ids.k1.klinik;

  const sup = async <T>(fn: (c: pg.Client) => Promise<T>, tenant?: string): Promise<T> => {
    const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "yerel-deneme", database: "klinik" });
    await c.connect();
    try {
      await c.query("BEGIN");
      if (tenant) await c.query("select set_config('app.tenant_id', $1, true)", [tenant]);
      const s = await fn(c);
      await c.query("COMMIT");
      return s;
    } finally {
      await c.end();
    }
  };
  let sayac = 0;
  const personel = async (rol: "klinik_admin" | "resepsiyon" | "terapist", hazir: boolean) => {
    const id = crypto.randomUUID();
    const telefon = `53${String(Date.now()).slice(-6)}${String(++sayac).padStart(2, "0")}`;
    const eposta = `e2e-${id}@deneme.test`;
    const h = await personelHesabiOlustur({ id, eposta, ad: "E2E Personel", telefon, rol, klinikId: K1 });
    await sup((c) => c.query("insert into kullanici(id, klinik_id, rol, ad_soyad, telefon) values ($1, $2, $3, 'E2E', $4)", [id, K1, rol, telefon]), K1);
    if (hazir) await sup((c) => c.query("update kimlik_kullanici set sifre_degistirmeli = false where id = $1", [id]));
    return { id, eposta, telefon, sifre: h.geciciSifre };
  };
  const hasta = async (hazir: boolean) => {
    const hastaId = crypto.randomUUID();
    const telefon = `54${String(Date.now()).slice(-6)}${String(++sayac).padStart(2, "0")}`;
    await sup((c) => c.query("insert into hasta(id, klinik_id, ad_soyad, telefon) values ($1, $2, 'E2E Hasta', $3)", [hastaId, K1, telefon]), K1);
    const h = await hastaHesabiOlustur({ hastaId, klinikId: K1, ad: "E2E Hasta", telefon });
    await sup((c) => c.query("insert into hasta_kullanici(id, hasta_id) values ($1, $2)", [h.id, hastaId]), K1);
    if (hazir) await sup((c) => c.query("update kimlik_kullanici set sifre_degistirmeli = false where id = $1", [h.id]));
    return { id: h.id, telefon, sifre: h.geciciSifre };
  };

  const hesaplar = {
    adminGecici: await personel("klinik_admin", false),
    adminHazir: await personel("klinik_admin", true),
    adminDonus: await personel("klinik_admin", true),
    adminCikis: await personel("klinik_admin", true),
    resepsiyonHazir: await personel("resepsiyon", true),
    terapistHazir: await personel("terapist", true),
    hastaGecici: await hasta(false),
    hastaHazir: await hasta(true),
  };
  // _ortam: gerçek zamanlı duman testi veritabanına doğrudan olay üretmek için (hesap değil)
  const dosya = { ...hesaplar, _ortam: { port, k1: duzenek.ids.k1, k2: duzenek.ids.k2 } };
  fs.writeFileSync(path.join(__dirname, ".hesaplar.json"), JSON.stringify(dosya, null, 1));
  return async () => {
    await duzenek.durdur();
  };
}

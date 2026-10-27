// klinik_uygulama bağlantı havuzu (DATABASE_URL). YALNIZ lib/db/ içinden kullanılır; uygulama kodu withTenant/withKullanici/withAnonim/withGlobal kullanır
// (eslint `no-restricted-imports` bunu zorlar). Bu havuz kimlik tablolarına erişemez (kimlik_rolu ayrı havuzdur).
import { Pool } from "pg";
import { baglantiAdresi } from "./ortam";

const global = globalThis as unknown as { __klinikUygulamaHavuzu?: Pool };

export function uygulamaHavuzu(): Pool {
  if (!global.__klinikUygulamaHavuzu) {
    global.__klinikUygulamaHavuzu = new Pool({
      connectionString: baglantiAdresi("DATABASE_URL"),
      max: Number(process.env.DB_HAVUZ_MAKS ?? 10),
      idleTimeoutMillis: 30_000,
      statement_timeout: 30_000,
      application_name: "klinik-uygulama",
    });
  }
  return global.__klinikUygulamaHavuzu;
}

export async function uygulamaHavuzunuKapat(): Promise<void> {
  await global.__klinikUygulamaHavuzu?.end();
  global.__klinikUygulamaHavuzu = undefined;
}

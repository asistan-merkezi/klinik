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
      // Zaman damgaları UTC olarak okunur ("... +00"); istemciye giderken lib/db/zaman.ts ISO 8601'e çevirir (Safari boşluklu biçimi ayrıştıramaz).
      options: "-c timezone=UTC",
    });
    // Boşta bekleyen bağlantı kopunca (sunucu yeniden başlatma vb.) pg Pool "error" olayını yakalanmazsa süreç çöker.
    global.__klinikUygulamaHavuzu.on("error", (e) => console.error("[db] uygulama havuzu boşta bağlantı hatası:", e.message));
  }
  return global.__klinikUygulamaHavuzu;
}

export async function uygulamaHavuzunuKapat(): Promise<void> {
  await global.__klinikUygulamaHavuzu?.end();
  global.__klinikUygulamaHavuzu = undefined;
}

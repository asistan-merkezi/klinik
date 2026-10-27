// kimlik_rolu bağlantı havuzu (KIMLIK_DATABASE_URL). YALNIZ Better Auth ve kimlik sorguları (lib/auth/**) içindir.
// Bu rol yalnız kimlik_kullanici / kimlik_hesap / oturum / kimlik_dogrulama tablolarına erişir; tenant verisini göremez.
import { Pool } from "pg";
import { baglantiAdresi } from "./ortam";

const global = globalThis as unknown as { __klinikKimlikHavuzu?: Pool };

export function kimlikHavuzu(): Pool {
  if (!global.__klinikKimlikHavuzu) {
    global.__klinikKimlikHavuzu = new Pool({
      connectionString: baglantiAdresi("KIMLIK_DATABASE_URL"),
      max: Number(process.env.DB_KIMLIK_HAVUZ_MAKS ?? 5),
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      application_name: "klinik-kimlik",
    });
    // Boşta bekleyen bağlantı kopunca (sunucu yeniden başlatma vb.) pg Pool "error" olayını yakalanmazsa süreç çöker.
    global.__klinikKimlikHavuzu.on("error", (e) => console.error("[db] kimlik havuzu boşta bağlantı hatası:", e.message));
  }
  return global.__klinikKimlikHavuzu;
}

export async function kimlikHavuzunuKapat(): Promise<void> {
  await global.__klinikKimlikHavuzu?.end();
  global.__klinikKimlikHavuzu = undefined;
}

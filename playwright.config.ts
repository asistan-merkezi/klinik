// Tarayıcı duman testleri (gerçek Next sunucusu + gerçek Better Auth + yerel test Postgres'i). Çalıştırma: cd scripts/dev && npm install, sonra: npm run test:e2e
// Sunucu 3100 portunda `next dev` ile açılır (3000 çoğu zaman başka proje). Tarayıcı: sistemdeki Microsoft Edge (indirme gerekmez).
import { defineConfig } from "@playwright/test";

const PORT = 3100;
const DB_PORT = Number(process.env.DEV_TEST_PORT ?? 54331);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/genel-kurulum.ts",
  fullyParallel: false,
  workers: 1,
  retries: 1, // Edge'in ilk başlatmasında seyrek "browser closed" hatası görüldü
  timeout: 120_000,
  expect: { timeout: 60_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, channel: "msedge", headless: true, trace: "retain-on-failure" },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    // Statik dosya: proxy/Better Auth devreye girmez (veritabanı globalSetup'ta, sunucudan SONRA kurulur).
    url: `http://localhost:${PORT}/tablet-offline.html`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_URL: `postgres://klinik_uygulama:u-deneme@localhost:${DB_PORT}/klinik`,
      KIMLIK_DATABASE_URL: `postgres://kimlik_rolu:k-deneme@localhost:${DB_PORT}/klinik`,
      BETTER_AUTH_SECRET: "e2e-gizli-anahtar-en-az-32-karakter-uzunlugunda-xx",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});

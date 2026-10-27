// Gerçek (yerel, geçici) Postgres'e karşı veritabanı/kimlik testleri: iki klinikli düzenek scripts/dev/test-kur.mjs ile kurulur.
// Çalıştırma: cd scripts/dev && npm install (bir kez), sonra repo kökünde: npm run test:db
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/genel-kurulum.ts"],
    setupFiles: ["tests/db/oturum-mock.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    env: {
      KLINIK_AUTH_NEXT_COOKIES: "0",
      BETTER_AUTH_SECRET: "test-gizli-anahtar-en-az-32-karakter-uzunlugunda-xx",
      BETTER_AUTH_URL: "http://localhost:3000",
    },
  },
});

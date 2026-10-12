import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Canlı Supabase'e GEÇİCİ klinik yazan entegrasyon betikleri (scripts/entegrasyon/*.itest.ts).
 * Varsayılan `npm test` bunları çalıştırmaz; yalnız `npm run test:entegrasyon` (ENTEGRASYON_ONAY=1 ile).
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["scripts/entegrasyon/**/*.itest.ts"],
    testTimeout: 90_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});

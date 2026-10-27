import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // Gerçek Postgres gerektiren veritabanı/kimlik testleri ayrı çalışır: npm run test:db (vitest.db.config.ts)
    exclude: [...configDefaults.exclude, "tests/db/**", "tests/e2e/**"],
  },
});

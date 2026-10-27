// Drizzle şemasını (lib/db/sema/) test kümesindeki gerçek şemadan üretir: node scripts/dev/drizzle-cek.mjs
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  out: "./lib/db/sema",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DRIZZLE_URL! },
});

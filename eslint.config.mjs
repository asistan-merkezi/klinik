import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const DOGRUDAN_SORGU_MESAJI =
  "Veritabanına doğrudan bağlanma/sorgu yasak: tenant verisi için lib/db'den withTenant/withKullanici/withAnonim/withGlobal kullan (docs/platform-katmani.md).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // drizzle-kit pull çıktısı (scripts/dev/drizzle-cek.mjs ile yeniden üretilir)
    "lib/db/sema/**",
    "scripts/dev/node_modules/**",
    "scripts/dev/.veri/**",
  ]),
  // withTenant dışında doğrudan sorgu çalıştırmayı engelle: havuz/pg/drizzle-pg yalnız lib/db ve lib/auth (kimlik) içinde import edilebilir.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["lib/db/**", "lib/auth/**", "scripts/dev/**", "db/kontrol/**", "tests/db/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "pg", message: DOGRUDAN_SORGU_MESAJI },
            { name: "drizzle-orm/node-postgres", message: DOGRUDAN_SORGU_MESAJI },
          ],
          patterns: [{ group: ["**/db/havuz-uygulama*", "**/db/havuz-kimlik*", "**/db/bakim*", "**/db/baglam*"], message: DOGRUDAN_SORGU_MESAJI }],
        },
      ],
    },
  },
  // lib/auth: kimlik havuzunu kullanabilir, uygulama havuzuna ve bakım bağlantısına DOKUNAMAZ.
  {
    files: ["lib/auth/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/db/havuz-uygulama*", "**/db/bakim*", "**/db/baglam*"], message: "lib/auth yalnız kimlik havuzunu kullanır; tenant verisi için lib/db (index) kullan." }] },
      ],
    },
  },
]);

export default eslintConfig;

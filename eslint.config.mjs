import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const DOGRUDAN_SORGU_MESAJI =
  "Veritabanına doğrudan bağlanma/sorgu yasak: tenant verisi için lib/db'den withTenant/withKullanici/withAnonim/withGlobal kullan (docs/platform-katmani.md).";

const BAGLAM_URETICI_MESAJI =
  "Veritabanı bağlamı yalnız getSessionContext() (lib/auth/oturum.ts) ve tanima çözümleyicisinden (lib/guvenlik/anonim-uc.ts) üretilir; istemci girdisinden bağlam üretmek yasak.";

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
    // esbuild çıktısı (npm run bakim:derle)
    "bakim-dist/**",
    "scripts/dev/.veri/**",
  ]),
  // withTenant dışında doğrudan sorgu çalıştırmayı engelle: havuz/pg/drizzle-pg yalnız lib/db ve lib/auth (kimlik) içinde import edilebilir.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["lib/db/**", "lib/auth/**", "lib/realtime/dinleyici.ts", "scripts/dev/**", "scripts/bakim/**", "db/kontrol/**", "tests/db/**", "tests/e2e/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "pg", message: DOGRUDAN_SORGU_MESAJI },
            { name: "drizzle-orm/node-postgres", message: DOGRUDAN_SORGU_MESAJI },
          ],
          patterns: [
            { group: ["**/db/havuz-uygulama*", "**/db/havuz-kimlik*", "**/db/bakim*", "**/db/baglam"], message: DOGRUDAN_SORGU_MESAJI },
            { group: ["**/db/baglam-uretici*"], message: BAGLAM_URETICI_MESAJI },
          ],
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
        {
          patterns: [
            { group: ["**/db/havuz-uygulama*", "**/db/bakim*", "**/db/baglam"], message: "lib/auth yalnız kimlik havuzunu kullanır; tenant verisi için lib/db (index) kullan." },
            { group: ["**/db/baglam-uretici*"], message: BAGLAM_URETICI_MESAJI },
          ],
        },
      ],
    },
  },
  // Bağlam üreticisini kullanmasına İZİN verilen tek üretim dosyaları (başka dosya import ederse eslint hata verir).
  // lib/realtime/dinleyici.ts: yalnız LISTEN bağlantısı (sorgu yok, tablo okumaz); olay yükü olayCoz ile doğrulanır.
  { files: ["lib/auth/oturum.ts", "lib/guvenlik/anonim-uc.ts"], rules: { "no-restricted-imports": "off" } },
]);

export default eslintConfig;

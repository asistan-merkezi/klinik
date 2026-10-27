// Uygulama kodunun veritabanına TEK giriş noktası. Havuzlar (pg Pool) buradan dışarı AÇILMAZ.
// Bağlam ÜRETİCİLERİ (baglam-uretici.ts) bilerek burada YOKTUR: yalnız getSessionContext() ve tanima çözümleyicisi import edebilir (ESLint).
export { withTenant, withKullanici, withAnonim, withGlobal, withTanima, GecersizBaglamHatasi, sql } from "./baglam";
export type { Tx, TenantBaglami, KullaniciBaglami, AnonimBaglam } from "./baglam";
export * as sema from "./sema/schema";

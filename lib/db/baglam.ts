// Veritabanı bağlamı: uygulamanın tenant verisine TEK giriş kapısı.
//
//   withTenant({ userId, tenantId }, tx => ...)   oturumlu kullanıcı, kendi kliniğinin verisi (RLS: klinik_uygulama)
//   withKullanici(userId, tx => ...)              tenant henüz bilinmiyor (oturum çözümleme): yalnız kullanıcının KENDİ satırı görünür
//   withAnonim({ tenantId }, tx => ...)           giriş öncesi, SET LOCAL ROLE klinik_anonim (QR kayıt/anket/iş başvurusu)
//   withGlobal(tx => ...)                         tenant'sız global fonksiyonlar (hiz_siniri_kullan, tanima.*); tenant tablolarından 0 satır görür
//
// Her biri BİR transaction'dır ve bağlamı `set_config(..., true)` (= SET LOCAL) ile verir: bağlam transaction bitince kaybolur, havuzdaki
// başka isteğe SIZMAZ. tenantId/userId HİÇBİR ZAMAN istemciden alınmaz; getSessionContext() veya tanima çözümlemesinden gelir.
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as sema from "./sema/schema";
import * as iliskiler from "./sema/relations";
import { uygulamaHavuzu } from "./havuz-uygulama";
import { damgaliMi, GecersizBaglamHatasi, type AnonimBaglam, type KullaniciBaglami, type TenantBaglami } from "./baglam-uretici";

function damgaDogrula(alan: string, ctx: unknown): void {
  if (!damgaliMi(ctx)) throw new GecersizBaglamHatasi(`${alan} (damgasız bağlam: yalnız getSessionContext()/tanima çözümleyicisi bağlam üretebilir)`);
}

const semaTumu = { ...sema, ...iliskiler };
export type UygulamaVeritabani = NodePgDatabase<typeof semaTumu>;
export type Tx = Parameters<Parameters<UygulamaVeritabani["transaction"]>[0]>[0];

let _db: UygulamaVeritabani | undefined;
/** Havuza bağlı drizzle örneği. DIŞARIYA AÇILMAZ: yalnız bu dosyadaki sarmalayıcılar kullanır. */
function db(): UygulamaVeritabani {
  _db ??= drizzle(uygulamaHavuzu(), { schema: semaTumu });
  return _db;
}
/** Test amaçlı: havuz değişince önbelleği sıfırlar. */
export function dbOnbelleginiSifirla(): void {
  _db = undefined;
}

export type { TenantBaglami, KullaniciBaglami, AnonimBaglam };
export { GecersizBaglamHatasi };

export async function withTenant<T>(ctx: TenantBaglami, fn: (tx: Tx) => Promise<T>): Promise<T> {
  damgaDogrula("withTenant", ctx);
  const { userId, tenantId } = ctx;
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true), set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/** Tenant bilinmeden kullanıcının kendi kullanici/hasta_kullanici satırını okumak için (oturum çözümleme). */
export async function withKullanici<T>(ctx: KullaniciBaglami, fn: (tx: Tx) => Promise<T>): Promise<T> {
  damgaDogrula("withKullanici", ctx);
  const id = ctx.userId;
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${id}, true)`);
    return fn(tx);
  });
}

/** Giriş öncesi anonim yazma: bağlam = QR kısa kodundan çözülen klinik; rol klinik_anonim. */
export async function withAnonim<T>(ctx: AnonimBaglam, fn: (tx: Tx) => Promise<T>): Promise<T> {
  damgaDogrula("withAnonim", ctx);
  const tenantId = ctx.tenantId;
  return db().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`set local role klinik_anonim`);
    return fn(tx);
  });
}

/** Tenant'sız global fonksiyonlar için (bağlam yok). Tenant tablolarından hiçbir satır görünmez. */
export async function withGlobal<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => fn(tx));
}

/** Giriş öncesi, tenant'sız çözümleme (rol klinik_anonim, bağlam yok): tanima.* fonksiyonları. */
export async function withTanima<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`set local role klinik_anonim`);
    return fn(tx);
  });
}

export { sql };

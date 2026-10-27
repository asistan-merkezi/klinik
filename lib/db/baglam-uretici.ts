// Veritabanı bağlamı ÜRETİCİSİ. withTenant/withKullanici/withAnonim yalnız buradan üretilmiş (damgalı) bağlam nesnelerini kabul eder:
//   - TİP düzeyinde: bağlam tipleri "marka" taşır; düz { userId, tenantId } nesnesi derlenmez.
//   - ÇALIŞMA ZAMANI düzeyinde: üretilen her nesne bir WeakSet'e yazılır, with* sarmalayıcıları damgasız nesneyi (as ile zorlanmış olsa bile) reddeder.
//   - ESLINT düzeyinde: bu modülün import'u yalnız getSessionContext() (lib/auth/oturum.ts) ve tanima çözümleyicisi (lib/guvenlik/anonim-uc.ts) ile
//     test/betik yardımcılarına açıktır (eslint.config.mjs). İstemci girdisinden (form, query, başlık) bağlam üretmek bu yüzden mümkün olmamalıdır.
declare const tenantMarkasi: unique symbol;
declare const kullaniciMarkasi: unique symbol;
declare const anonimMarkasi: unique symbol;

export type TenantBaglami = { readonly userId: string; readonly tenantId: string; readonly [tenantMarkasi]: true };
export type KullaniciBaglami = { readonly userId: string; readonly [kullaniciMarkasi]: true };
export type AnonimBaglam = { readonly tenantId: string; readonly [anonimMarkasi]: true };

const damgali = new WeakSet<object>();

export class GecersizBaglamHatasi extends Error {
  constructor(alan: string) {
    super(`Geçersiz veritabanı bağlamı: ${alan}`);
    this.name = "GecersizBaglamHatasi";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(alan: string, deger: unknown): string {
  if (typeof deger !== "string" || !UUID.test(deger)) throw new GecersizBaglamHatasi(alan);
  return deger.toLowerCase();
}

function damgala<T extends object>(nesne: T): T {
  const dondur = Object.freeze(nesne);
  damgali.add(dondur);
  return dondur;
}

/** Oturumdan çözülmüş kullanıcı + tenant (getSessionContext çıktısından). */
export function tenantBaglamiUret(g: { userId: string; tenantId: string }): TenantBaglami {
  return damgala({ userId: uuid("userId", g.userId), tenantId: uuid("tenantId", g.tenantId) }) as TenantBaglami;
}

/** Tenant bilinmeden yalnız kullanıcının kendi satırını okumak için (oturum çözümleme). */
export function kullaniciBaglamiUret(userId: string): KullaniciBaglami {
  return damgala({ userId: uuid("userId", userId) }) as KullaniciBaglami;
}

/** Kısa koddan (tanima) çözülmüş klinik için anonim bağlam. */
export function anonimBaglamUret(tenantId: string): AnonimBaglam {
  return damgala({ tenantId: uuid("tenantId", tenantId) }) as AnonimBaglam;
}

/** with* sarmalayıcılarının iç doğrulaması: damgasız nesne = istemci girdisinden/elle kurulmuş olabilir -> reddedilir. */
export function damgaliMi(nesne: unknown): boolean {
  return typeof nesne === "object" && nesne !== null && damgali.has(nesne);
}

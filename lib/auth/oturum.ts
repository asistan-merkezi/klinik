// Oturum bağlamı. Tenant kimliği ve rol ASLA istemciden alınmaz: oturum (Better Auth, veritabanı) -> kimlik kaydı -> tenant tablosu.
//   personel : kullanici satırından (klinik_id, rol) — withKullanici ile (tenant bilinmeden, yalnız KENDİ satırı görünür)
//   hasta    : kimlik_kullanici.klinik_id + hasta_kullanici.aktif (withTenant ile doğrulanır)
import { eq } from "drizzle-orm";
import { withKullanici, withTenant, sema, rpc, type TenantBaglami, type KullaniciBaglami } from "@/lib/db";
import { kullaniciBaglamiUret, tenantBaglamiUret } from "@/lib/db/baglam-uretici";
import { kimlik } from "./auth";
import { geceKapanisinaTakildi } from "./gece-kapanis";

export type OturumRolu = "super_admin" | "klinik_admin" | "resepsiyon" | "terapist" | "muhasebe" | "hasta";

export type OturumBaglami = {
  userId: string;
  /** Super admin'de null (klinik bağlamı yok); diğerlerinde klinik kimliği. */
  tenantId: string | null;
  rol: OturumRolu;
  tur: "personel" | "hasta";
  hastaId: string | null;
  /** Personelde kullanici.ad_soyad; hastada boş. */
  adSoyad: string | null;
  eposta: string;
  /** Geçici şifreyle girildi: şifre değiştirilene kadar başka sayfaya geçilemez. */
  sifreDegistirmeli: boolean;
  cihazKimligi: string | null;
  /** super_admin'in AKTİF destek bağlamı (süre sınırlı, denetlenen; lib/destek/baglam.ts). Bu varsa tenantId bağlam kliniğidir. */
  destek?: { klinikId: string; bitis: Date; gerekce: string } | null;
};

export class OturumHatasi extends Error {
  constructor(public readonly status: 401 | 403, mesaj: string) {
    super(mesaj);
    this.name = "OturumHatasi";
  }
}

type OturumKullanicisi = {
  id: string; email: string; tur?: string; klinikId?: string | null; hastaId?: string | null; devreDisi?: boolean; sifreDegistirmeli?: boolean;
};

/** Hafif oturum okuma (proxy için): yalnız Better Auth oturumu + kimlik bayrakları; tenant sorgusu YOK. */
export async function oturumOku(basliklar: Headers): Promise<{ user: OturumKullanicisi; cihazKimligi: string | null; olusturma: Date } | null> {
  const s = await kimlik().api.getSession({ headers: basliklar });
  if (!s?.user) return null;
  const user = s.user as unknown as OturumKullanicisi;
  if (user.devreDisi) return null;
  return { user, cihazKimligi: ((s.session as unknown as { cihazKimligi?: string | null }).cihazKimligi) ?? null, olusturma: new Date(s.session.createdAt) };
}

/** Tam bağlam; oturum yoksa/geçersizse null (çağıran 401 verir). */
export async function getSessionContext(basliklar: Headers): Promise<OturumBaglami | null> {
  const o = await oturumOku(basliklar);
  if (!o) return null;
  const { user } = o;
  const tur = user.tur === "hasta" ? "hasta" : "personel";
  const ortak = { userId: user.id, eposta: user.email, sifreDegistirmeli: Boolean(user.sifreDegistirmeli), cihazKimligi: o.cihazKimligi };

  if (tur === "personel") {
    const satir = await withKullanici(kullaniciBaglamiUret(user.id), (tx) =>
      tx.select({ klinikId: sema.kullanici.klinikId, rol: sema.kullanici.rol, adSoyad: sema.kullanici.adSoyad }).from(sema.kullanici).where(eq(sema.kullanici.id, user.id)).limit(1)
    );
    const k = satir[0];
    if (!k) return null; // kimlik var ama tenant kaydı yok (yarım kalmış hesap) -> oturum yok sayılır
    // Gece zorunlu çıkış (resepsiyon/terapist): kapanış anından önce açılmış oturum geçersiz (lib/auth/gece-kapanis.ts).
    if (geceKapanisinaTakildi(k.rol, o.olusturma)) return null;
    // super_admin klinik bağlamı taşımaz; yalnız AKTİF destek bağlamı varsa o klinikte çalışır (DB current_klinik_id() de aynı kuralı zorlar: süre dolunca bağlam düşer).
    if (k.rol === "super_admin" && !k.klinikId) {
      const aktif = await withKullanici(kullaniciBaglamiUret(user.id), (tx) => rpc<{ klinik_id: string; bitis: string | Date; gerekce: string }>(tx, "destek_baglami_aktif", {}));
      const d = aktif[0];
      const destek = d ? { klinikId: d.klinik_id, bitis: new Date(d.bitis), gerekce: d.gerekce } : null;
      return { ...ortak, tenantId: destek?.klinikId ?? null, rol: k.rol, tur, hastaId: null, adSoyad: k.adSoyad, destek };
    }
    return { ...ortak, tenantId: k.klinikId, rol: k.rol, tur, hastaId: null, adSoyad: k.adSoyad, destek: null };
  }

  // hasta: tenant kimlik kaydından gelir (giriş sırasında tanima ile çözülmüş klinik), hasta_kullanici aktif olmalı
  if (!user.klinikId) return null;
  const tenantId = user.klinikId;
  const satir = await withTenant(tenantBaglamiUret({ userId: user.id, tenantId }), (tx) =>
    tx.select({ hastaId: sema.hastaKullanici.hastaId, aktif: sema.hastaKullanici.aktif }).from(sema.hastaKullanici).where(eq(sema.hastaKullanici.id, user.id)).limit(1)
  );
  const h = satir[0];
  if (!h || !h.aktif) return null;
  return { ...ortak, tenantId, rol: "hasta", tur, hastaId: h.hastaId, adSoyad: null };
}

/** Oturum yoksa 401 fırlatır. */
export async function requireSessionContext(basliklar: Headers): Promise<OturumBaglami> {
  const ctx = await getSessionContext(basliklar);
  if (!ctx) throw new OturumHatasi(401, "Oturum bulunamadı.");
  return ctx;
}

/** Rol kapısı: yetkisizse 403. `super_admin` her kümeyi geçer (mevcut eylemYetkisiGetir kuralı). */
export function rolGerekli(ctx: OturumBaglami, roller: readonly OturumRolu[]): void {
  if (ctx.rol === "super_admin" || roller.includes(ctx.rol)) return;
  throw new OturumHatasi(403, "Bu işlem için yetkiniz yok.");
}

/** Tenant bağlamı gereken işler için: super_admin gibi klinik bağlamı olmayan oturumlarda 403. */
export function tenantGerekli(ctx: OturumBaglami): TenantBaglami {
  if (!ctx.tenantId) throw new OturumHatasi(403, "Bu işlem bir klinik bağlamı gerektirir.");
  return tenantBaglamiUret({ userId: ctx.userId, tenantId: ctx.tenantId });
}

/** Klinik bağlamı gerektirmeyen, YALNIZ kullanıcının kimliğiyle çalışan işler için (ör. super_admin destek bağlamı açma/kapama). Tenant verisi görünmez. */
export function kullaniciGerekli(ctx: OturumBaglami): KullaniciBaglami {
  if (ctx.tur !== "personel") throw new OturumHatasi(403, "Bu işlem personel oturumu gerektirir.");
  return kullaniciBaglamiUret(ctx.userId);
}

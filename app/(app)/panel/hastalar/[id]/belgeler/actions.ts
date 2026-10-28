"use server";

import { uuidZorunlu } from "@/lib/guvenlik/girdi";
import { and, eq, isNull } from "drizzle-orm";
import { pgHata, sema, withTenant } from "@/lib/db";
import { eylemYetkisi } from "@/lib/auth/yetki";
import { belgeKaliciSil as belgeKaliciSilServis, BELGE_OKUMA_ROLLERI, BELGE_SILME_ROLLERI } from "@/lib/belge/servis";

// Dosyalar web kökü dışındadır; indirme/görüntüleme/küçük resim bağlantıları YETKİLİ route'a (/api/hasta-belge/[id]) işaret eder ve her istekte
// oturum + rol + tenant yeniden doğrulanır (imzalı/süreli URL yok). Erişim izi (audit_log) route'ta, gerçek açma anında yazılır.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function yetkiliBaglamGetir(hastaId: string) {
  const y = await eylemYetkisi(BELGE_OKUMA_ROLLERI);
  if (!y.yetkili || !y.bag || !UUID.test(hastaId)) return { yetkisiz: true as const };
  // RLS: hasta çağıranın kliniğinde görünüyorsa var.
  const hasta = (await withTenant(y.bag, (tx) => tx.select({ id: sema.hasta.id }).from(sema.hasta).where(eq(sema.hasta.id, hastaId)).limit(1)))[0];
  if (!hasta) return { yetkisiz: true as const };
  return { bag: y.bag, userId: y.ctx.userId, rol: y.ctx.rol as string, klinikId: y.klinikId!, yetkisiz: false as const };
}

export async function klinikFotoOnamKaydet(hastaId: string): Promise<{ success: true } | { error: string }> {
  uuidZorunlu(hastaId, "hastaId");
  const ctx = await yetkiliBaglamGetir(hastaId);
  if (ctx.yetkisiz) return { error: "Bu işlem için yetkiniz yok." };

  try {
    await withTenant(ctx.bag, (tx) =>
      tx.insert(sema.hastaOnam).values({ klinikId: ctx.klinikId, hastaId, onamTipi: "klinik_foto", imzalayan: "hasta", imzaStoragePath: null, olusturanKullaniciId: ctx.userId })
    );
  } catch (e) {
    console.error("Klinik foto onamı kaydedilemedi:", pgHata(e).mesaj);
    return { error: "Kaydedilemedi, lütfen tekrar deneyin." };
  }
  return { success: true };
}

export async function belgeSil(belgeId: string, hastaId: string): Promise<{ success: true } | { error: string }> {
  uuidZorunlu(belgeId, "belgeId");
  uuidZorunlu(hastaId, "hastaId");
  const ctx = await yetkiliBaglamGetir(hastaId);
  if (ctx.yetkisiz || !(BELGE_SILME_ROLLERI as readonly string[]).includes(ctx.rol) || !UUID.test(belgeId)) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  try {
    // Belge gerçekten BU hastanın mı (istemci hastaId'si ile belgeId'nin eşleşmesi doğrulanır) ve zaten silinmemiş mi.
    const guncellenen = await withTenant(ctx.bag, (tx) =>
      tx
        .update(sema.hastaBelge)
        .set({ deletedAt: new Date().toISOString() })
        .where(and(eq(sema.hastaBelge.id, belgeId), eq(sema.hastaBelge.hastaId, hastaId), isNull(sema.hastaBelge.deletedAt)))
        .returning({ id: sema.hastaBelge.id })
    );
    if (guncellenen.length === 0) return { error: "Belge bulunamadı." };
  } catch (e) {
    console.error("Belge silinemedi:", pgHata(e).mesaj);
    return { error: "Silinemedi, lütfen tekrar deneyin." };
  }
  return { success: true };
}

export async function belgeKaliciSil(belgeId: string, hastaId: string): Promise<{ success: true } | { error: string }> {
  uuidZorunlu(belgeId, "belgeId");
  uuidZorunlu(hastaId, "hastaId");
  const ctx = await yetkiliBaglamGetir(hastaId);
  if (ctx.yetkisiz || ctx.rol !== "klinik_admin" || !UUID.test(belgeId)) {
    return { error: "Bu işlem için yetkiniz yok." };
  }
  try {
    const tamam = await belgeKaliciSilServis({ bag: ctx.bag, rol: ctx.rol, belgeId });
    if (!tamam) return { error: "Belge bulunamadı." };
  } catch (e) {
    console.error("Belge kalıcı silinemedi:", pgHata(e).mesaj);
    return { error: "Silinemedi, lütfen tekrar deneyin." };
  }
  return { success: true };
}

/** Liste/galeri küçük resmi: erişim izi yazılmaz (rutin yükleme). Küçük resmi olmayan belgede url null. */
export async function belgeThumbnailUrlAl(belgeId: string): Promise<{ url: string | null } | { error: string }> {
  uuidZorunlu(belgeId, "belgeId");
  const y = await eylemYetkisi(BELGE_OKUMA_ROLLERI);
  if (!y.yetkili || !y.bag || !UUID.test(belgeId)) return { error: "Oturum bulunamadı." };

  const belge = (await withTenant(y.bag, (tx) => tx.select({ thumbnailPath: sema.hastaBelge.thumbnailPath }).from(sema.hastaBelge).where(eq(sema.hastaBelge.id, belgeId)).limit(1)))[0];
  if (!belge) return { error: "Belge bulunamadı." };
  if (!belge.thumbnailPath) return { url: null };
  return { url: `/api/hasta-belge/${belgeId}?islem=kucuk` };
}

/** Gerçek "indir" eylemi: bağlantı açıldığında route hem 'select' hem 'indirme' izini yazar. */
export async function belgeIndir(belgeId: string): Promise<{ url: string; klinikAdi: string } | { error: string }> {
  uuidZorunlu(belgeId, "belgeId");
  const y = await eylemYetkisi(BELGE_OKUMA_ROLLERI);
  if (!y.yetkili || !y.bag || !UUID.test(belgeId)) return { error: "Oturum bulunamadı." };
  const bag = y.bag;

  const bilgi = await withTenant(bag, async (tx) => {
    const b = (await tx.select({ id: sema.hastaBelge.id }).from(sema.hastaBelge).where(eq(sema.hastaBelge.id, belgeId)).limit(1))[0];
    if (!b) return null;
    return (await tx.select({ ad: sema.klinik.ad }).from(sema.klinik).where(eq(sema.klinik.id, bag.tenantId)).limit(1))[0] ?? { ad: "" };
  });
  if (!bilgi) return { error: "Belge bulunamadı veya erişim yetkiniz yok." };
  return { url: `/api/hasta-belge/${belgeId}?islem=indir`, klinikAdi: bilgi.ad };
}

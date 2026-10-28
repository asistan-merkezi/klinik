// Personel belgeleri sunumu — izin belgesi ve kaşe görseli web kökü dışındaki DOSYA_KOKU/personel-belge altında durur ve YALNIZ yetkili route'lardan servis edilir.
// Her istekte: (1) oturum + tenant (route'ta), (2) rol/sahiplik kuralı, (3) kayıt kullanıcının KENDİ tenant bağlamında (RLS) okunur,
// (4) kayıtlı dosya yolu beklenen kalıba (`<tenant>/izin/<personel>/<dosya>` ya da `<tenant>/<personel>/kase.<uzantı>`) uymalı — veritabanındaki yol
// başka kliniğe/başka kişiye işaret edemez, '..' içeremez (path traversal), (5) dosya depo katmanındaki yol doğrulamasından geçerek okunur.
import { and, eq } from "drizzle-orm";
import { sema, withTenant, type TenantBaglami } from "@/lib/db";
import { dosyaOku } from "./depo";

export type PersonelBelgeSonucu = { tur: "ok"; veri: Buffer; mime: string; dosyaAdi: string } | { tur: "yetkisiz" } | { tur: "yok" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const UZANTI_ADI = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.(pdf|jpg|png|webp)$/;

/** İzin belgesini görebilenler: talebin sahibi personel ve klinik yöneticisi (izin talepleri yalnız yöneticide değerlendirilir; RLS de muhasebeye talep satırını göstermez). */
export function izinBelgesiniGorebilirMi(rol: string, sahibiMi: boolean): boolean {
  return sahibiMi || rol === "klinik_admin";
}
/** Kaşe görseli (imza niteliğinde) yalnız klinik yöneticisine açıktır. */
export function kaseyiGorebilirMi(rol: string): boolean {
  return rol === "klinik_admin";
}

/** Saf: kayıtlı yolu doğrular ve depo parçalarına böler; kalıba uymayan/başka tenant'a işaret eden yol null döner. */
export function izinBelgeParcalari(kayitliYol: string, tenantId: string, personelId: string): string[] | null {
  const p = kayitliYol.split("/");
  if (p.length !== 4 || p[0] !== tenantId || p[1] !== "izin" || p[2] !== personelId || !UZANTI_ADI.test(p[3])) return null;
  return p;
}
export function kaseParcalari(kayitliYol: string, tenantId: string, personelId: string): string[] | null {
  const p = kayitliYol.split("/");
  if (p.length !== 3 || p[0] !== tenantId || p[1] !== personelId || !/^kase\.(jpg|png|webp)$/.test(p[2])) return null;
  return p;
}

const mimeOf = (ad: string) => MIME[ad.split(".").pop() ?? ""] ?? "application/octet-stream";

export async function izinBelgesiGetir(g: { bag: TenantBaglami; tenantId: string; rol: string; kullaniciId: string; talepId: string }): Promise<PersonelBelgeSonucu> {
  if (!UUID.test(g.talepId)) return { tur: "yok" };
  const talep = await withTenant(g.bag, async (tx) => {
    const t = (
      await tx
        .select({ personelId: sema.personelIzinTalebi.personelId, belge: sema.personelIzinTalebi.belgeUrl, sahipKullanici: sema.personel.kullaniciId })
        .from(sema.personelIzinTalebi)
        .innerJoin(sema.personel, eq(sema.personel.id, sema.personelIzinTalebi.personelId))
        .where(and(eq(sema.personelIzinTalebi.id, g.talepId), eq(sema.personelIzinTalebi.klinikId, g.tenantId)))
        .limit(1)
    )[0];
    return t ?? null;
  });
  if (!talep) return { tur: "yok" }; // RLS: başka kliniğin talebi hiç görünmez → "yok" (varlık sızdırılmaz)
  if (!izinBelgesiniGorebilirMi(g.rol, talep.sahipKullanici === g.kullaniciId)) return { tur: "yetkisiz" };
  if (!talep.belge) return { tur: "yok" };
  const parcalar = izinBelgeParcalari(talep.belge, g.tenantId, talep.personelId);
  if (!parcalar) return { tur: "yok" };
  const veri = await dosyaOku("personel-belge", parcalar);
  if (!veri) return { tur: "yok" };
  return { tur: "ok", veri, mime: mimeOf(parcalar[3]), dosyaAdi: `izin-belgesi.${parcalar[3].split(".").pop()}` };
}

export async function kaseGorseliGetir(g: { bag: TenantBaglami; tenantId: string; rol: string; personelId: string }): Promise<PersonelBelgeSonucu> {
  if (!UUID.test(g.personelId)) return { tur: "yok" };
  if (!kaseyiGorebilirMi(g.rol)) return { tur: "yetkisiz" };
  const kayit = (
    await withTenant(g.bag, (tx) =>
      tx
        .select({ kase: sema.personelMeslekiBelge.kaseGorselUrl })
        .from(sema.personelMeslekiBelge)
        .innerJoin(sema.personel, eq(sema.personel.id, sema.personelMeslekiBelge.personelId))
        .where(and(eq(sema.personelMeslekiBelge.personelId, g.personelId), eq(sema.personel.klinikId, g.tenantId)))
        .limit(1)
    )
  )[0];
  if (!kayit?.kase) return { tur: "yok" };
  const parcalar = kaseParcalari(kayit.kase, g.tenantId, g.personelId);
  if (!parcalar) return { tur: "yok" };
  const veri = await dosyaOku("personel-belge", parcalar);
  if (!veri) return { tur: "yok" };
  return { tur: "ok", veri, mime: mimeOf(parcalar[2]), dosyaAdi: parcalar[2] };
}

export function belgeYaniti(s: Extract<PersonelBelgeSonucu, { tur: "ok" }>): Response {
  return new Response(new Uint8Array(s.veri), {
    headers: {
      "Content-Type": s.mime,
      "Content-Disposition": `inline; filename="${s.dosyaAdi}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}

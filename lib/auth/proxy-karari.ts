// proxy.ts'in saf karar mantığı (test edilebilir). Oturum bilgisi proxy'de Better Auth'tan (veritabanı) okunur; cookie'nin varlığı YETMEZ.
// Asıl güvenlik sınırı sayfa/eylem içindeki getSessionContext + RLS'tir; proxy yalnız yönlendirir.
export type ProxyOturumu = { tur: "personel" | "hasta"; sifreDegistirmeli: boolean } | null;
export type ProxyKarari = { tur: "gec" } | { tur: "yonlendir"; hedef: string };

export const SIFRE_DEGISTIR_YOLU = "/sifre-degistir";
export const PERSONEL_GIRIS_YOLU = "/giris";
export const PORTAL_GIRIS_YOLU = "/portal/giris";

const PORTAL_GIRIS_KALIBI = /^\/portal\/(giris|[A-Za-z0-9_-]+\/giris)\/?$/;

const panelMi = (yol: string) => yol === "/panel" || yol.startsWith("/panel/");
const portalMi = (yol: string) => (yol === "/portal" || yol.startsWith("/portal/")) && !PORTAL_GIRIS_KALIBI.test(yol);
const sifreDegistirMi = (yol: string) => yol === SIFRE_DEGISTIR_YOLU;

export function proxyKarari(yol: string, oturum: ProxyOturumu): ProxyKarari {
  const korunan = panelMi(yol) || portalMi(yol) || sifreDegistirMi(yol);
  if (!korunan) return { tur: "gec" };

  if (!oturum) {
    if (portalMi(yol)) return { tur: "yonlendir", hedef: PORTAL_GIRIS_YOLU };
    return { tur: "yonlendir", hedef: PERSONEL_GIRIS_YOLU };
  }
  // Geçici şifreyle girilmiş: şifre değiştirilmeden başka hiçbir korumalı sayfaya geçilemez.
  if (oturum.sifreDegistirmeli && !sifreDegistirMi(yol)) return { tur: "yonlendir", hedef: SIFRE_DEGISTIR_YOLU };
  // Panel/portal ayrımı: hasta panele, personel portala girmez.
  if (oturum.tur === "hasta" && panelMi(yol)) return { tur: "yonlendir", hedef: "/portal" };
  if (oturum.tur === "personel" && portalMi(yol)) return { tur: "yonlendir", hedef: "/panel" };
  return { tur: "gec" };
}

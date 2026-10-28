// Güncelleme (GitHub okuma) jetonunun durumu. deploy/windows/guncelle.ps1 her çalışmada <Kok>\durum\jeton.json dosyasını yazar:
//   { "kontrol": ISO zaman, "durum": "ok" | "reddedildi", "sonKullanma": ISO zaman | null }
// İçinde jetonun KENDİSİ yoktur. /api/saglik bu dosyayı okur (yalnız iç ayrıntıda gösterir; dışarıya yalnız genel {durum} gider).
export type JetonDurumu = "ok" | "yaklasiyor" | "dolmus" | "reddedildi" | "kontrol_eski" | "bilinmiyor";

export const JETON_UYARI_GUN = 14;
export const JETON_KONTROL_ESKI_SAAT = 72;

export function jetonDurumuHesapla(ham: string | null, simdi: Date): { durum: JetonDurumu; kalanGun: number | null } {
  if (!ham) return { durum: "bilinmiyor", kalanGun: null };
  let v: { kontrol?: unknown; durum?: unknown; sonKullanma?: unknown };
  try {
    v = JSON.parse(ham);
  } catch {
    return { durum: "bilinmiyor", kalanGun: null };
  }
  const zaman = (x: unknown): number | null => {
    if (typeof x !== "string") return null;
    const t = Date.parse(x);
    return Number.isNaN(t) ? null : t;
  };
  const son = zaman(v.sonKullanma);
  const kalanGun = son === null ? null : Math.floor((son - simdi.getTime()) / 86_400_000);
  if (v.durum === "reddedildi") return { durum: "reddedildi", kalanGun };
  if (kalanGun !== null && son !== null && son <= simdi.getTime()) return { durum: "dolmus", kalanGun };
  if (kalanGun !== null && kalanGun <= JETON_UYARI_GUN) return { durum: "yaklasiyor", kalanGun };
  const kontrol = zaman(v.kontrol);
  if (kontrol === null || simdi.getTime() - kontrol > JETON_KONTROL_ESKI_SAAT * 3_600_000) return { durum: "kontrol_eski", kalanGun };
  return { durum: "ok", kalanGun };
}

// /b/[token] çözümleyicisi (saf olmayan kısım route'ta). Bağlantı OTURUM AÇMAZ ve veri göstermez: geçerliyse alıcıyı ilgili GİRİŞ sayfasına yönlendirir;
// geçersiz / kullanılmış / süresi dolmuş durumlar AYNI yanıtı verir (ayrım sızdırılmaz). Tek kullanımlık: ilk geçerli kullanım satırı işaretler.
import { rpc, withGlobal } from "@/lib/db";
import { HizSiniriHatasi, hizAnahtari, hizSiniriKaydet, istemciImzasi } from "@/lib/guvenlik/hiz-siniri";
import { tokenHashle } from "./baglanti";

export const TOKEN_KALIBI = /^[A-Za-z0-9_-]{32,128}$/;
const KISA_KOD_KALIBI = /^[A-Za-z0-9_-]{1,32}$/;

export type BaglantiSonucu = { tur: "yonlendir"; yol: string } | { tur: "hiz" } | { tur: "kullanilamiyor" };

export const GIRIS_YOLU = "/giris";

/** Giriş öncesi çağrı: IP başına 30 istek / 10 dk (fail-closed — sayaç yazılamazsa reddedilir). */
export async function baglantiyiCoz(token: string, basliklar: Headers): Promise<BaglantiSonucu> {
  try {
    await hizSiniriKaydet([{ anahtar: hizAnahtari("b_baglanti:ip", istemciImzasi(basliklar)), limit: 30, pencereSn: 600 }]);
  } catch (e) {
    return e instanceof HizSiniriHatasi && e.neden === "asildi" ? { tur: "hiz" } : { tur: "kullanilamiyor" };
  }
  if (!TOKEN_KALIBI.test(token)) return { tur: "yonlendir", yol: GIRIS_YOLU };
  try {
    const satirlar = await withGlobal((tx) => rpc<{ alici_tipi: string; klinik_kisa_kod: string | null }>(tx, "bildirim_baglantisi_kullan", { p_token_hash: tokenHashle(token) }));
    const s = satirlar[0];
    if (s?.alici_tipi === "hasta" && s.klinik_kisa_kod && KISA_KOD_KALIBI.test(s.klinik_kisa_kod)) return { tur: "yonlendir", yol: `/portal/${s.klinik_kisa_kod}/giris` };
    return { tur: "yonlendir", yol: GIRIS_YOLU };
  } catch {
    return { tur: "kullanilamiyor" };
  }
}

// Şifre değiştirme, "şifremi unuttum" (personel) ve sıfırlama. Hasta şifre sıfırlaması resepsiyon geçici şifresiyle kalır (hesap.ts > geciciSifreYenile).
// "Unuttum": tek kullanımlık, 30 dk ömürlü bağlantı (Better Auth reset token'ı), hız sınırlı (FAIL-CLOSED), hesap varlığını sızdırmayan ORTAK yanıt,
// e-postada kişisel veri yok (lib/auth/eposta.ts).
import { kimlikHavuzu } from "@/lib/db/havuz-kimlik";
import { HizSiniriHatasi, hizAnahtari, hizSiniriKaydet, hizSiniriKontrol, istemciImzasi } from "@/lib/guvenlik/hiz-siniri";
import { kimlik } from "./auth";
import { sifrePolitikasiHatasi } from "./sifre";

export const MESAJ_UNUTTUM_ORTAK = "Bu e-posta adresiyle kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.";
export const MESAJ_SIFIRLAMA_GECERSIZ = "Bağlantı geçersiz veya süresi dolmuş. Lütfen yeni bir sıfırlama isteyin.";

export type IslemSonucu = { ok: true; cerezler?: string[] } | { ok: false; mesaj: string };

async function bayraklariTemizle(kullaniciId: string): Promise<void> {
  await kimlikHavuzu().query("update kimlik_kullanici set sifre_degistirmeli = false, gecici_sifre_bitis = null, guncelleme = now() where id = $1", [kullaniciId]);
}

/** Oturumlu kullanıcı kendi şifresini değiştirir (geçici şifreyle girenler için zorunlu adım). Diğer tüm oturumlar iptal edilir. */
export async function sifreDegistir(g: { basliklar: Headers; mevcutSifre: string; yeniSifre: string }): Promise<IslemSonucu> {
  const ipImza = istemciImzasi(g.basliklar);
  const oturum = await kimlik().api.getSession({ headers: g.basliklar });
  if (!oturum?.user) return { ok: false, mesaj: "Oturum bulunamadı." };
  const kurallar = [
    { anahtar: hizAnahtari("sifre_degistir:hesap", oturum.user.id), limit: 5, pencereSn: 15 * 60 },
    { anahtar: `sifre_degistir:ip:${ipImza}`, limit: 30, pencereSn: 15 * 60 },
  ];
  try {
    await hizSiniriKontrol(kurallar);
  } catch (e) {
    return { ok: false, mesaj: e instanceof HizSiniriHatasi ? e.message : "İşlem şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin." };
  }
  const politika = sifrePolitikasiHatasi(g.yeniSifre);
  if (politika) return { ok: false, mesaj: politika };
  if (g.yeniSifre === g.mevcutSifre) return { ok: false, mesaj: "Yeni şifre mevcut şifreyle aynı olamaz." };
  let cerezler: string[];
  try {
    // revokeOtherSessions: Better Auth diğer oturumları siler ve BU cihaz için YENİ oturum üretir -> yeni cookie çağırana döner
    // (Next server action'da nextCookies eklentisi bunu otomatik yazar; başka bağlamlarda çağıran uygulamalıdır).
    const { headers } = await kimlik().api.changePassword({ body: { currentPassword: g.mevcutSifre, newPassword: g.yeniSifre, revokeOtherSessions: true }, headers: g.basliklar, returnHeaders: true });
    cerezler = headers.getSetCookie();
  } catch {
    await hizSiniriKaydet(kurallar).catch(() => {});
    return { ok: false, mesaj: "Mevcut şifre hatalı." };
  }
  await bayraklariTemizle(oturum.user.id);
  return { ok: true, cerezler };
}

/** "Şifremi unuttum" (yalnız personel). Her durumda AYNI yanıt döner; hız sınırı aşılsa da, hesap olmasa da, devre dışı olsa da. */
export async function sifremiUnuttum(g: { eposta: string; basliklar: Headers; geriDonusAdresi: string }): Promise<{ mesaj: string }> {
  const eposta = g.eposta.trim().toLowerCase();
  const kurallar = [
    { anahtar: hizAnahtari("unuttum:hesap", eposta), limit: 3, pencereSn: 60 * 60 },
    { anahtar: `unuttum:ip:${istemciImzasi(g.basliklar)}`, limit: 10, pencereSn: 60 * 60 },
  ];
  try {
    // İstek her seferinde sayılır (hesap var olmasa da): FAIL-CLOSED -> sayaç yazılamazsa e-posta GÖNDERİLMEZ, yine ortak yanıt.
    await hizSiniriKaydet(kurallar);
  } catch {
    return { mesaj: MESAJ_UNUTTUM_ORTAK };
  }
  if (!eposta || !eposta.includes("@")) return { mesaj: MESAJ_UNUTTUM_ORTAK };
  const r = await kimlikHavuzu().query("select 1 from kimlik_kullanici where eposta = $1 and tur = 'personel' and not devre_disi", [eposta]);
  if (r.rowCount) {
    try {
      await kimlik().api.requestPasswordReset({ body: { email: eposta, redirectTo: g.geriDonusAdresi } });
    } catch (e) {
      console.error("[sifremi-unuttum] istek başarısız:", e instanceof Error ? e.message : e);
    }
  }
  return { mesaj: MESAJ_UNUTTUM_ORTAK };
}

/** Sıfırlama bağlantısındaki jetonla yeni şifre belirler. Jeton tek kullanımlıktır (Better Auth kullanınca siler) ve 30 dakikada dolar. */
export async function sifreSifirla(g: { jeton: string; yeniSifre: string; basliklar: Headers }): Promise<IslemSonucu> {
  const kurallar = [{ anahtar: `sifirla:ip:${istemciImzasi(g.basliklar)}`, limit: 20, pencereSn: 15 * 60 }];
  try {
    await hizSiniriKaydet(kurallar);
  } catch (e) {
    return { ok: false, mesaj: e instanceof HizSiniriHatasi ? e.message : "İşlem şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin." };
  }
  const politika = sifrePolitikasiHatasi(g.yeniSifre);
  if (politika) return { ok: false, mesaj: politika };
  try {
    await kimlik().api.resetPassword({ body: { newPassword: g.yeniSifre, token: g.jeton } });
  } catch {
    return { ok: false, mesaj: MESAJ_SIFIRLAMA_GECERSIZ };
  }
  return { ok: true };
}

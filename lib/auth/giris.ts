// Giriş akışları (Seçenek D). Hata mesajları HESAP VARLIĞINI SIZDIRMAZ: bilinmeyen hesap, yanlış şifre, devre dışı hesap, yanlış klinik aynı mesajı verir.
// Hız sınırı FAIL-CLOSED (lib/guvenlik/hiz-siniri.ts). Giriş sonrası ?donus= yalnız guvenliDonusAdresi ile (open redirect yok) — çağıran (server action) uygular.
//
//   personelGirisi  : e-posta (yalnız klinik_admin/super_admin) VEYA telefon (diğer roller) + parola.
//                     Telefon -> e-posta çevirimi kimlik_rolu ile dar bir sorgudur; anonim DEFINER RPC YOK.
//   hastaGirisi     : (klinik kısa kodu, telefon) + parola. Klinik, tanima şemasından çözülür; hasta telefonu klinikler arası tekil olmak zorunda değildir.
import { kimlikHavuzu } from "@/lib/db/havuz-kimlik";
import { withTanima, sql } from "@/lib/db";
import { HizSiniriHatasi, hizAnahtari, hizSiniriKaydet, hizSiniriKontrol, istemciImzasi, type HizSiniriKurali } from "@/lib/guvenlik/hiz-siniri";
import { CIHAZ_BASLIGI, IP_HASH_BASLIGI, kimlik } from "./auth";
import { sahteDogrulama } from "./sifre";

export const MESAJ_HATALI_PERSONEL_EPOSTA = "E-posta veya şifre hatalı.";
export const MESAJ_HATALI_PERSONEL_TELEFON = "Telefon veya şifre hatalı.";
export const MESAJ_HATALI_HASTA = "Telefon veya şifre hatalı.";
export const MESAJ_KILITLI = "Çok fazla hatalı deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.";
export const MESAJ_KULLANILAMIYOR = "İşlem şu anda yapılamıyor. Lütfen daha sonra tekrar deneyin.";
export const MESAJ_GECICI_SURESI_DOLDU = "Geçici şifrenizin süresi doldu. Lütfen yeni bir geçici şifre için kliniğinizle iletişime geçin.";
export const MESAJ_TELEFONLA_GIRIS = "Bu hesap yalnızca telefon numarasıyla giriş yapabilir.";
export const MESAJ_EPOSTAYLA_GIRIS = "Bu hesap yalnızca e-posta ile giriş yapabilir.";

const PENCERE_SN = 15 * 60;

export type GirisSonucu =
  | { ok: true; sifreDegistirmeli: boolean; tur: "personel" | "hasta"; kullaniciId: string; cerezler: string[] }
  | { ok: false; kod: "hatali" | "kilitli" | "kullanilamiyor" | "gecici_suresi_doldu" | "telefonla" | "epostayla"; mesaj: string };

/** Telefonu karşılaştırma biçimine indirir (SQL telefon_normalize ile aynı kural: son 10 hane). */
export function telefonNormalize(telefon: string): string | null {
  const rakamlar = telefon.replace(/\D/g, "");
  const son = rakamlar.slice(-10);
  return son.length ? son : null;
}

function hesapKurallari(onEk: string, kimlikMetni: string, ipImza: string): HizSiniriKurali[] {
  return [
    { anahtar: hizAnahtari(`${onEk}:hesap`, kimlikMetni), limit: 5, pencereSn: PENCERE_SN },
    { anahtar: `${onEk}:ip:${ipImza}`, limit: 30, pencereSn: PENCERE_SN },
  ];
}

/** Giriş denemesi için Better Auth'a gidecek başlıklar: çağıranın cookie'leri + cihaz kimliği + IP hash'i (ham IP yazılmaz). */
function girisBasliklari(gelen: Headers, cihazKimligi: string, ipImza: string): Headers {
  const h = new Headers();
  const cookie = gelen.get("cookie");
  if (cookie) h.set("cookie", cookie);
  const origin = gelen.get("origin");
  if (origin) h.set("origin", origin);
  const ua = gelen.get("user-agent");
  if (ua) h.set("user-agent", ua);
  h.set(CIHAZ_BASLIGI, cihazKimligi);
  h.set(IP_HASH_BASLIGI, ipImza);
  return h;
}

async function signIn(eposta: string, sifre: string, basliklar: Headers) {
  try {
    const { headers, response } = await kimlik().api.signInEmail({ body: { email: eposta, password: sifre }, headers: basliklar, returnHeaders: true });
    if (!response?.user) return null;
    return { kullaniciId: response.user.id as string, cerezler: headers.getSetCookie() };
  } catch {
    return null; // yanlış şifre / hesap yok / hook reddi: hepsi aynı sonuç
  }
}

async function oturumuIptalEt(kullaniciId: string): Promise<void> {
  await kimlikHavuzu().query("delete from oturum where kullanici_id = $1", [kullaniciId]);
}

async function girisSonrasiDurum(kullaniciId: string) {
  const r = await kimlikHavuzu().query<{ tur: "personel" | "hasta"; sifre_degistirmeli: boolean; gecici_sifre_bitis: Date | null; telefonla_giris: boolean; devre_disi: boolean }>(
    "select tur, sifre_degistirmeli, gecici_sifre_bitis, telefonla_giris, devre_disi from kimlik_kullanici where id = $1",
    [kullaniciId]
  );
  return r.rows[0];
}

async function kilitKontrol(kurallar: HizSiniriKurali[]): Promise<GirisSonucu | null> {
  try {
    await hizSiniriKontrol(kurallar);
    return null;
  } catch (e) {
    if (e instanceof HizSiniriHatasi && e.neden === "asildi") return { ok: false, kod: "kilitli", mesaj: MESAJ_KILITLI };
    return { ok: false, kod: "kullanilamiyor", mesaj: MESAJ_KULLANILAMIYOR }; // FAIL-CLOSED
  }
}

async function basarisizKaydet(kurallar: HizSiniriKurali[]): Promise<void> {
  try {
    await hizSiniriKaydet(kurallar);
  } catch {
    /* sayaç yazılamasa da deneme zaten reddedildi; sonraki denemede kontrol fail-closed çalışır */
  }
}

export async function personelGirisi(g: { girisAdi: string; sifre: string; basliklar: Headers; cihazKimligi: string }): Promise<GirisSonucu> {
  const girisAdi = g.girisAdi.trim();
  const eposta = girisAdi.includes("@");
  const onEk = "personel_giris";
  const ipImza = istemciImzasi(g.basliklar);
  const kimlikMetni = eposta ? girisAdi.toLowerCase() : (telefonNormalize(girisAdi) ?? girisAdi);
  const kurallar = hesapKurallari(onEk, kimlikMetni, ipImza);
  const hataMesaji = eposta ? MESAJ_HATALI_PERSONEL_EPOSTA : MESAJ_HATALI_PERSONEL_TELEFON;

  if (!girisAdi || !g.sifre) return { ok: false, kod: "hatali", mesaj: eposta ? "E-posta ve şifre gerekli." : "Telefon/e-posta ve şifre gerekli." };
  const kilit = await kilitKontrol(kurallar);
  if (kilit) return kilit;

  // Giriş e-postasını belirle (kimlik_rolu, dar sorgu). Bulunamazsa sahte doğrulama ile süre eşitlenir.
  let girisEpostasi: string | null = null;
  if (eposta) {
    girisEpostasi = girisAdi.toLowerCase();
  } else {
    const tel = telefonNormalize(girisAdi);
    if (tel) {
      const r = await kimlikHavuzu().query<{ eposta: string }>(
        "select eposta from kimlik_kullanici where tur = 'personel' and telefonla_giris and not devre_disi and telefon_norm = $1 limit 1",
        [tel]
      );
      girisEpostasi = r.rows[0]?.eposta ?? null;
    }
  }
  if (!girisEpostasi) {
    await sahteDogrulama(g.sifre);
    await basarisizKaydet(kurallar);
    return { ok: false, kod: "hatali", mesaj: hataMesaji };
  }

  const basliklar = girisBasliklari(g.basliklar, g.cihazKimligi, ipImza);
  const sonuc = await signIn(girisEpostasi, g.sifre, basliklar);
  if (!sonuc) {
    await basarisizKaydet(kurallar);
    return { ok: false, kod: "hatali", mesaj: hataMesaji };
  }
  const durum = await girisSonrasiDurum(sonuc.kullaniciId);
  // Yalnız DOĞRU şifreyle buraya gelinir: kurallar ihlali burada açıkça söylenebilir (hesap varlığı zaten bilinen kişiye).
  if (!durum || durum.devre_disi || durum.tur !== "personel") {
    await oturumuIptalEt(sonuc.kullaniciId);
    await basarisizKaydet(kurallar);
    return { ok: false, kod: "hatali", mesaj: hataMesaji };
  }
  if (eposta && durum.telefonla_giris) {
    await oturumuIptalEt(sonuc.kullaniciId);
    return { ok: false, kod: "telefonla", mesaj: MESAJ_TELEFONLA_GIRIS };
  }
  if (!eposta && !durum.telefonla_giris) {
    await oturumuIptalEt(sonuc.kullaniciId);
    return { ok: false, kod: "epostayla", mesaj: MESAJ_EPOSTAYLA_GIRIS };
  }
  if (durum.gecici_sifre_bitis && durum.gecici_sifre_bitis.getTime() < Date.now()) {
    await oturumuIptalEt(sonuc.kullaniciId);
    return { ok: false, kod: "gecici_suresi_doldu", mesaj: MESAJ_GECICI_SURESI_DOLDU };
  }
  return { ok: true, sifreDegistirmeli: durum.sifre_degistirmeli, tur: "personel", kullaniciId: sonuc.kullaniciId, cerezler: sonuc.cerezler };
}

/** Portal kısa kodundan (QR kısa kodu) klinik kimliği: tenant'sız tanima fonksiyonu. */
export async function klinikCozumle(kisaKod: string): Promise<{ id: string; ad: string } | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(kisaKod)) return null;
  const sonuc = await withTanima((tx) => tx.execute(sql`select id, ad from tanima.klinik_qr_bilgisi_getir(${kisaKod})`));
  const satir = sonuc.rows[0] as { id: string; ad: string } | undefined;
  return satir ?? null;
}

export async function hastaGirisi(g: { klinikKodu: string; telefon: string; sifre: string; basliklar: Headers; cihazKimligi: string }): Promise<GirisSonucu> {
  const tel = telefonNormalize(g.telefon);
  const onEk = "portal_giris";
  const ipImza = istemciImzasi(g.basliklar);
  // Hesap anahtarı kliniği de içerir: aynı numara farklı klinikte ayrı sayaç.
  const kurallar = hesapKurallari(onEk, `${g.klinikKodu.toLowerCase()}|${tel ?? g.telefon}`, ipImza);
  if (!tel || !g.sifre) return { ok: false, kod: "hatali", mesaj: "Telefon ve şifre gerekli." };
  const kilit = await kilitKontrol(kurallar);
  if (kilit) return kilit;

  let klinik: { id: string; ad: string } | null = null;
  try {
    klinik = await klinikCozumle(g.klinikKodu);
  } catch {
    return { ok: false, kod: "kullanilamiyor", mesaj: MESAJ_KULLANILAMIYOR }; // FAIL-CLOSED
  }
  let girisEpostasi: string | null = null;
  if (klinik) {
    const r = await kimlikHavuzu().query<{ eposta: string }>(
      "select eposta from kimlik_kullanici where tur = 'hasta' and klinik_id = $1 and telefon_norm = $2 and not devre_disi limit 1",
      [klinik.id, tel]
    );
    girisEpostasi = r.rows[0]?.eposta ?? null;
  }
  if (!girisEpostasi) {
    await sahteDogrulama(g.sifre);
    await basarisizKaydet(kurallar);
    return { ok: false, kod: "hatali", mesaj: MESAJ_HATALI_HASTA };
  }
  const basliklar = girisBasliklari(g.basliklar, g.cihazKimligi, ipImza);
  const sonuc = await signIn(girisEpostasi, g.sifre, basliklar);
  if (!sonuc) {
    await basarisizKaydet(kurallar);
    return { ok: false, kod: "hatali", mesaj: MESAJ_HATALI_HASTA };
  }
  const durum = await girisSonrasiDurum(sonuc.kullaniciId);
  if (!durum || durum.devre_disi || durum.tur !== "hasta") {
    await oturumuIptalEt(sonuc.kullaniciId);
    await basarisizKaydet(kurallar);
    return { ok: false, kod: "hatali", mesaj: MESAJ_HATALI_HASTA };
  }
  if (durum.gecici_sifre_bitis && durum.gecici_sifre_bitis.getTime() < Date.now()) {
    await oturumuIptalEt(sonuc.kullaniciId);
    return { ok: false, kod: "gecici_suresi_doldu", mesaj: MESAJ_GECICI_SURESI_DOLDU };
  }
  return { ok: true, sifreDegistirmeli: durum.sifre_degistirmeli, tur: "hasta", kullaniciId: sonuc.kullaniciId, cerezler: sonuc.cerezler };
}

export async function cikisYap(basliklar: Headers): Promise<string[]> {
  try {
    const { headers } = await kimlik().api.signOut({ headers: basliklar, returnHeaders: true });
    return headers.getSetCookie();
  } catch {
    return [];
  }
}

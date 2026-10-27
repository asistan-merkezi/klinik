// Better Auth (kurulu sürüm 1.7.14) yapılandırması. Alan/seçenek adları resmi belgeden ve paketin tip tanımlarından alınmıştır
// (docs/platform-katmani.md "Better Auth sürüm notları").
//   - Veritabanı: kimlik_rolu havuzu (yalnız kimlik tabloları). Tablo/kolon adları Türkçe: modelName + fields eşlemesi.
//   - Parola: argon2id. Kayıt (sign-up) KAPALI: hesapları yalnız yöneticiler/resepsiyon oluşturur (lib/auth/hesap.ts).
//   - Oturum: veritabanında (oturum tablosu), httpOnly + (üretimde) Secure cookie, cookieCache KAPALI (iptal anında etkili olsun).
//   - IP: Better Auth'un IP izlemesi kapalı; yalnız kısa hash databaseHooks ile yazılır.
//   - Tek oturum kilidi YAZILMADI; cihaz kimliği (cihaz_kimligi) oturuma yazılır, ileride kilit bu alandan beslenecek.
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { kimlikHavuzu } from "@/lib/db/havuz-kimlik";
import { epostaGonder, sifirlamaEpostasiIcerigi } from "./eposta";
import { sifreDogrula, sifreHashle, SIFRE_MIN_UZUNLUK } from "./sifre";

export const SIFIRLAMA_SURESI_SN = 30 * 60;
export const CIHAZ_BASLIGI = "x-klinik-cihaz";
export const IP_HASH_BASLIGI = "x-klinik-ip-hash";

function olustur() {
  const uretim = process.env.NODE_ENV === "production";
  const eklentiler = process.env.KLINIK_AUTH_NEXT_COOKIES === "0" ? [] : [nextCookies()];
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: kimlikHavuzu(),
    user: {
      modelName: "kimlik_kullanici",
      fields: { name: "ad", email: "eposta", emailVerified: "eposta_dogrulandi", image: "gorsel", createdAt: "olusturma", updatedAt: "guncelleme" },
      additionalFields: {
        tur: { type: "string", required: false, defaultValue: "personel", input: false, fieldName: "tur" },
        klinikId: { type: "string", required: false, input: false, fieldName: "klinik_id" },
        hastaId: { type: "string", required: false, input: false, fieldName: "hasta_id" },
        telefon: { type: "string", required: false, input: false, fieldName: "telefon" },
        telefonlaGiris: { type: "boolean", required: false, defaultValue: false, input: false, fieldName: "telefonla_giris" },
        sifreDegistirmeli: { type: "boolean", required: false, defaultValue: false, input: false, fieldName: "sifre_degistirmeli" },
        geciciSifreBitis: { type: "date", required: false, input: false, fieldName: "gecici_sifre_bitis" },
        devreDisi: { type: "boolean", required: false, defaultValue: false, input: false, fieldName: "devre_disi" },
      },
    },
    session: {
      modelName: "oturum",
      fields: { userId: "kullanici_id", token: "jeton", expiresAt: "bitis", ipAddress: "ip_hash", userAgent: "user_agent", createdAt: "olusturma", updatedAt: "guncelleme" },
      additionalFields: { cihazKimligi: { type: "string", required: false, input: false, fieldName: "cihaz_kimligi" } },
      expiresIn: Number(process.env.OTURUM_SURESI_SN ?? 12 * 60 * 60),
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "kimlik_hesap",
      fields: {
        accountId: "hesap_id", providerId: "saglayici_id", userId: "kullanici_id", accessToken: "access_token", refreshToken: "refresh_token", idToken: "id_token",
        accessTokenExpiresAt: "access_token_bitis", refreshTokenExpiresAt: "refresh_token_bitis", scope: "scope", password: "parola_hash", createdAt: "olusturma", updatedAt: "guncelleme",
      },
    },
    verification: {
      modelName: "kimlik_dogrulama",
      fields: { identifier: "tanimlayici", value: "deger", expiresAt: "bitis", createdAt: "olusturma", updatedAt: "guncelleme" },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      autoSignIn: false,
      minPasswordLength: SIFRE_MIN_UZUNLUK,
      maxPasswordLength: 128,
      password: { hash: sifreHashle, verify: sifreDogrula },
      resetPasswordTokenExpiresIn: SIFIRLAMA_SURESI_SN,
      revokeSessionsOnPasswordReset: true,
      // Sıfırlama sonrası geçici şifre bayrakları temizlenir (kullanıcı kendi belirlediği şifreyle girer).
      onPasswordReset: async ({ user }) => {
        await kimlikHavuzu().query("update kimlik_kullanici set sifre_degistirmeli = false, gecici_sifre_bitis = null, guncelleme = now() where id = $1", [user.id]);
      },
      // Belge: e-posta gönderimini beklemeyin (zamanlama farkı hesap varlığını sızdırır). Gövdede kişisel veri YOK.
      sendResetPassword: async ({ user, url }) => {
        const icerik = sifirlamaEpostasiIcerigi(url);
        void epostaGonder({ alici: user.email, ...icerik }).catch((e) => console.error("[eposta] sıfırlama e-postası gönderilemedi:", e instanceof Error ? e.message : e));
      },
    },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      useSecureCookies: uretim,
      cookiePrefix: "klinik",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: uretim },
      ipAddress: { disableIpTracking: true },
    },
    rateLimit: { enabled: false }, // Giriş/sıfırlama hız sınırı DB tabanlı ve fail-closed olarak kendi katmanımızda (lib/guvenlik/hiz-siniri.ts)
    databaseHooks: {
      session: {
        create: {
          before: async (oturum, ctx) => {
            const basliklar = ctx?.headers ?? ctx?.request?.headers;
            // Devre dışı kullanıcıya oturum AÇILMAZ (savunma katmanı; lib/auth/giris.ts önceden de denetler).
            const r = await kimlikHavuzu().query("select devre_disi from kimlik_kullanici where id = $1", [oturum.userId]);
            if (r.rows[0]?.devre_disi) return false;
            return {
              data: {
                ...oturum,
                cihazKimligi: basliklar?.get(CIHAZ_BASLIGI) ?? null,
                ipAddress: basliklar?.get(IP_HASH_BASLIGI) ?? null,
              },
            };
          },
        },
      },
    },
    plugins: eklentiler, // nextCookies SON eklenti olmalı
  });
}

type Kimlik = ReturnType<typeof olustur>;
const global = globalThis as unknown as { __klinikKimlik?: Kimlik };

/** Tembel tekil örnek: ortam değişkenleri yokken (build) modül yüklenmesi hata vermesin. */
export function kimlik(): Kimlik {
  global.__klinikKimlik ??= olustur();
  return global.__klinikKimlik;
}

export function kimlikSifirla(): void {
  global.__klinikKimlik = undefined;
}

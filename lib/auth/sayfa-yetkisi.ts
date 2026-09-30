import { redirect } from "next/navigation";
import { gecerliKullanici, type GecerliKullanici } from "@/lib/auth/gecerli-kullanici";

export type KullaniciRolu = NonNullable<NonNullable<GecerliKullanici["kullanici"]>["rol"]>;

/**
 * Sık tekrar eden rol kümeleri. `super_admin` her sayfada zaten geçer
 * (bkz. sayfaYetkisiIste), bu yüzden listelere yazılmaz.
 */
export const ROL_GRUPLARI = {
  /** Kasa/Banka/Kredi Kartı/Giderler/Raporlar: yönetim + muhasebe. */
  finansYonetim: ["klinik_admin", "muhasebe"],
  /** Cari alacaklar / fatura kesme: resepsiyon da erişir. */
  finansFatura: ["klinik_admin", "resepsiyon", "muhasebe"],
} as const satisfies Record<string, readonly KullaniciRolu[]>;

/**
 * Sayfa (Server Component) düzeyinde rol kapısı — her sayfanın kendi
 * `supabase.auth.getUser()` + `kullanici` SELECT + `rol === ...` zincirini
 * tekrarlamasının yerine geçer.
 *
 *  - Oturum yoksa            → /giris
 *  - Rol yok / listede değil → /panel (eski sayfa kontrolleriyle aynı hedef)
 *  - `super_admin` her zaman geçer (kök CLAUDE.md: super_admin bypass'ı).
 *
 * Bir KULLANICI ARAYÜZÜ kontrolüdür, güvenlik sınırı DEĞİL: asıl sınır RLS ve
 * SECURITY DEFINER RPC'lerdir (kök CLAUDE.md > Teknik Borç). Bu yüzden
 * middleware'e taşınmadı — rol JWT claim'i değil `kullanici` tablosunda, her
 * istekte DB sorgusu gerekirdi. `gecerliKullanici` React cache() ile sarılı;
 * layout ile aynı istekte tekrar sorgu atmaz, ayrıca tek oturum kilidini
 * (lib/auth/oturum-kilidi.ts) de uygular.
 *
 * Dönen `kullanici.rol` daraltılmıştır; `duzenlenebilir` gibi ek bayrakları
 * çağıran sayfa `kullanici.rol === "klinik_admin"` ile türetmeye devam eder.
 */
export async function sayfaYetkisiIste(izinliRoller: readonly KullaniciRolu[]) {
  const oturum = await gecerliKullanici();

  if (!oturum) {
    redirect("/giris");
  }

  const { kullanici } = oturum;
  if (!kullanici?.rol || (kullanici.rol !== "super_admin" && !izinliRoller.includes(kullanici.rol))) {
    redirect("/panel");
  }

  return { authUser: oturum.authUser, kullanici: { ...kullanici, rol: kullanici.rol } };
}

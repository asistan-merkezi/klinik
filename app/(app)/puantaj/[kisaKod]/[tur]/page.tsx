import { notFound, redirect } from "next/navigation";
import { klinikQrBilgisiGetir } from "@/lib/qr/klinik-bilgisi";
import { qrKoduAktifMi } from "@/lib/qr/qr-kod-aktif-mi";
import { gecerliKullanici } from "@/lib/auth/gecerli-kullanici";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { KayitFormu } from "./kayit-formu";

export default async function PuantajSayfasi({
  params,
}: {
  params: Promise<{ kisaKod: string; tur: string }>;
}) {
  const { kisaKod, tur } = await params;

  if (tur !== "giris" && tur !== "cikis") {
    notFound();
  }

  const klinik = await klinikQrBilgisiGetir(kisaKod);

  if (!klinik) {
    return <KamuFormBulunamadi />;
  }

  const tip = tur === "giris" ? "puantaj_giris" : "puantaj_cikis";
  const aktif = await qrKoduAktifMi(klinik.id, tip);

  const baslik = tur === "giris" ? "Personel Girişi" : "Personel Çıkışı";

  if (!aktif) {
    return (
      <KamuFormKarti klinikAd={klinik.ad} baslik="Kullanım Dışı" aciklama="Bu form şu anda geçici olarak kapatılmış.">
        <p className="text-sm text-muted-foreground">Lütfen resepsiyon ile iletişime geçin.</p>
      </KamuFormKarti>
    );
  }

  // Kimlik oturumdan gelir — oturum yoksa giriş sayfasına gidilir, giriş
  // sonrası aynı QR adresine dönülür (`donus`, bkz. lib/auth/donus-adresi.ts).
  const oturum = await gecerliKullanici();
  if (!oturum) {
    redirect(`/giris?donus=${encodeURIComponent(`/puantaj/${kisaKod}/${tur}`)}`);
  }

  if (!oturum.kullanici || oturum.kullanici.klinik_id !== klinik.id) {
    return (
      <KamuFormKarti klinikAd={klinik.ad} baslik={baslik} aciklama="Bu işlem yapılamıyor.">
        <p className="text-sm text-muted-foreground">
          Bu QR kodu yalnızca kliniğin personeli tarafından, kendi hesabıyla kullanılabilir.
        </p>
      </KamuFormKarti>
    );
  }

  const ad = oturum.kullanici.ad_soyad;

  return (
    <KamuFormKarti
      klinikAd={klinik.ad}
      baslik={baslik}
      aciklama={ad ? `Merhaba, ${ad}` : "Hesabınızla devam edin."}
    >
      <KayitFormu klinikId={klinik.id} tur={tur} />
    </KamuFormKarti>
  );
}

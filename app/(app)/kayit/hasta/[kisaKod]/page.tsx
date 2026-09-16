import { klinikQrBilgisiGetir } from "@/lib/qr/klinik-bilgisi";
import { qrKoduAktifMi } from "@/lib/qr/qr-kod-aktif-mi";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { HastaQrFormu } from "./hasta-qr-formu";

export default async function HastaQrKayitSayfasi({
  params,
}: {
  params: Promise<{ kisaKod: string }>;
}) {
  const { kisaKod } = await params;
  const klinik = await klinikQrBilgisiGetir(kisaKod);

  if (!klinik) {
    return <KamuFormBulunamadi />;
  }

  const aktif = await qrKoduAktifMi(klinik.id, "hasta_on_kayit");

  if (!aktif) {
    return (
      <KamuFormKarti klinikAd={klinik.ad} baslik="Kullanım Dışı" aciklama="Bu form şu anda geçici olarak kapatılmış.">
        <p className="text-sm text-muted-foreground">Lütfen resepsiyon ile iletişime geçin.</p>
      </KamuFormKarti>
    );
  }

  return (
    <KamuFormKarti klinikAd={klinik.ad} baslik="Hasta Ön Kayıt" aciklama="Bilgilerinizi girin, resepsiyonda sizi karşılayalım.">
      <HastaQrFormu klinikId={klinik.id} />
    </KamuFormKarti>
  );
}

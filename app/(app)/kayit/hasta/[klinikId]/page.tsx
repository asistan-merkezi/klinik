import { klinikAdGetir } from "@/lib/qr/klinik-bilgisi";
import { qrKoduAktifMi } from "@/lib/qr/qr-kod-aktif-mi";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { HastaQrFormu } from "./hasta-qr-formu";

export default async function HastaQrKayitSayfasi({
  params,
}: {
  params: Promise<{ klinikId: string }>;
}) {
  const { klinikId } = await params;
  const [klinikAd, aktif] = await Promise.all([
    klinikAdGetir(klinikId),
    qrKoduAktifMi(klinikId, "hasta_on_kayit"),
  ]);

  if (!klinikAd) {
    return <KamuFormBulunamadi />;
  }

  if (!aktif) {
    return (
      <KamuFormKarti klinikAd={klinikAd} baslik="Kullanım Dışı" aciklama="Bu form şu anda geçici olarak kapatılmış.">
        <p className="text-sm text-muted-foreground">Lütfen resepsiyon ile iletişime geçin.</p>
      </KamuFormKarti>
    );
  }

  return (
    <KamuFormKarti klinikAd={klinikAd} baslik="Hasta Ön Kayıt" aciklama="Bilgilerinizi girin, resepsiyonda sizi karşılayalım.">
      <HastaQrFormu klinikId={klinikId} />
    </KamuFormKarti>
  );
}

import { klinikAdGetir } from "@/lib/qr/klinik-bilgisi";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { HastaQrFormu } from "./hasta-qr-formu";

export default async function HastaQrKayitSayfasi({
  params,
}: {
  params: Promise<{ klinikId: string }>;
}) {
  const { klinikId } = await params;
  const klinikAd = await klinikAdGetir(klinikId);

  if (!klinikAd) {
    return <KamuFormBulunamadi />;
  }

  return (
    <KamuFormKarti klinikAd={klinikAd} baslik="Hasta Ön Kayıt" aciklama="Bilgilerinizi girin, resepsiyonda sizi karşılayalım.">
      <HastaQrFormu klinikId={klinikId} />
    </KamuFormKarti>
  );
}

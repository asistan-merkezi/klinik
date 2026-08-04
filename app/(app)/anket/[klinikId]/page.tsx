import { klinikAdGetir } from "@/lib/qr/klinik-bilgisi";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { AnketFormu } from "./anket-formu";

export default async function AnketSayfasi({
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
    <KamuFormKarti klinikAd={klinikAd} baslik="Anket ve Öneriler" aciklama="Görüşleriniz bizim için değerli.">
      <AnketFormu klinikId={klinikId} />
    </KamuFormKarti>
  );
}

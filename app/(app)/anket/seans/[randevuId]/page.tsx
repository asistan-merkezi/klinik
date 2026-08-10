import { seansAnketBaglamGetir } from "@/lib/qr/seans-anket-baglami";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { SeansAnketFormu } from "./seans-anket-formu";

export default async function SeansAnketSayfasi({
  params,
}: {
  params: Promise<{ randevuId: string }>;
}) {
  const { randevuId } = await params;
  const baglam = await seansAnketBaglamGetir(randevuId);

  if (!baglam) {
    return <KamuFormBulunamadi />;
  }

  if (baglam.zatenDolduruldu) {
    return (
      <KamuFormKarti klinikAd={baglam.klinikAd} baslik="Teşekkürler" aciklama="Bu seans için değerlendirmenizi zaten aldık.">
        <p className="text-sm text-muted-foreground">Geri bildiriminiz için teşekkür ederiz.</p>
      </KamuFormKarti>
    );
  }

  return (
    <KamuFormKarti
      klinikAd={baglam.klinikAd}
      baslik="Seans Değerlendirmesi"
      aciklama="Bugünkü seansınızı nasıl değerlendirirsiniz?"
    >
      <SeansAnketFormu randevuId={randevuId} />
    </KamuFormKarti>
  );
}

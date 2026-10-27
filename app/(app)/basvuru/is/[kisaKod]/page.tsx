import { klinikQrBilgisi } from "@/lib/guvenlik/anonim-uc";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { IsBasvuruFormu } from "./is-basvuru-formu";

export default async function IsBasvuruSayfasi({
  params,
}: {
  params: Promise<{ kisaKod: string }>;
}) {
  const { kisaKod } = await params;
  const klinik = await klinikQrBilgisi(kisaKod);

  if (!klinik) {
    return <KamuFormBulunamadi />;
  }

  return (
    <KamuFormKarti
      klinikAd={klinik.ad}
      baslik="İş Başvurusu"
      aciklama="Kişisel bilgiler, eğitim, iş deneyimi ve referanslarınızı içeren başvuru formu."
      genis
    >
      <IsBasvuruFormu kisaKod={kisaKod} />
    </KamuFormKarti>
  );
}

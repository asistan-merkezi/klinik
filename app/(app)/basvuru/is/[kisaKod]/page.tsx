import { klinikQrBilgisiGetir } from "@/lib/qr/klinik-bilgisi";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { IsBasvuruFormu } from "./is-basvuru-formu";

export default async function IsBasvuruSayfasi({
  params,
}: {
  params: Promise<{ kisaKod: string }>;
}) {
  const { kisaKod } = await params;
  const klinik = await klinikQrBilgisiGetir(kisaKod);

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
      <IsBasvuruFormu klinikId={klinik.id} />
    </KamuFormKarti>
  );
}

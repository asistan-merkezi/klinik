import { klinikAdGetir } from "@/lib/qr/klinik-bilgisi";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { IsBasvuruFormu } from "./is-basvuru-formu";

export default async function IsBasvuruSayfasi({
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
    <KamuFormKarti
      klinikAd={klinikAd}
      baslik="İş Başvurusu"
      aciklama="Kişisel bilgiler, eğitim, iş deneyimi ve referanslarınızı içeren başvuru formu."
      genis
    >
      <IsBasvuruFormu klinikId={klinikId} />
    </KamuFormKarti>
  );
}

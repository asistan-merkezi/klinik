import { klinikAdGetir } from "@/lib/qr/klinik-bilgisi";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { PersonelTaslakFormu } from "./personel-taslak-formu";

export default async function PersonelBasvuruSayfasi({
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
      baslik="Personel Başvurusu"
      aciklama="Bilgilerinizi girin, klinik yönetimi onayladıktan sonra sizinle iletişime geçilecektir."
    >
      <PersonelTaslakFormu klinikId={klinikId} />
    </KamuFormKarti>
  );
}

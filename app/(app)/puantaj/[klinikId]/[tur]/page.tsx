import { notFound } from "next/navigation";
import { klinikAdGetir } from "@/lib/qr/klinik-bilgisi";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { PinFormu } from "./pin-formu";

export default async function PuantajSayfasi({
  params,
}: {
  params: Promise<{ klinikId: string; tur: string }>;
}) {
  const { klinikId, tur } = await params;

  if (tur !== "giris" && tur !== "cikis") {
    notFound();
  }

  const klinikAd = await klinikAdGetir(klinikId);

  if (!klinikAd) {
    return <KamuFormBulunamadi />;
  }

  const baslik = tur === "giris" ? "Personel Girişi" : "Personel Çıkışı";

  return (
    <KamuFormKarti klinikAd={klinikAd} baslik={baslik} aciklama="Puantaj PIN'inizi girin.">
      <PinFormu klinikId={klinikId} tur={tur} />
    </KamuFormKarti>
  );
}

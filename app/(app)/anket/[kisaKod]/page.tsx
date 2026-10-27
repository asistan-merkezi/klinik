import { klinikQrBilgisi, qrAktifMi } from "@/lib/guvenlik/anonim-uc";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { AnketFormu } from "./anket-formu";

export default async function AnketSayfasi({
  params,
}: {
  params: Promise<{ kisaKod: string }>;
}) {
  const { kisaKod } = await params;
  const klinik = await klinikQrBilgisi(kisaKod);

  if (!klinik) {
    return <KamuFormBulunamadi />;
  }

  const aktif = await qrAktifMi(klinik.id, "anket");

  if (!aktif) {
    return (
      <KamuFormKarti klinikAd={klinik.ad} baslik="Kullanım Dışı" aciklama="Bu form şu anda geçici olarak kapatılmış.">
        <p className="text-sm text-muted-foreground">Lütfen resepsiyon ile iletişime geçin.</p>
      </KamuFormKarti>
    );
  }

  return (
    <KamuFormKarti klinikAd={klinik.ad} baslik="Anket ve Öneriler" aciklama="Görüşleriniz bizim için değerli.">
      <AnketFormu kisaKod={kisaKod} />
    </KamuFormKarti>
  );
}

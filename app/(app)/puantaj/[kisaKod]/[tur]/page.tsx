import { notFound } from "next/navigation";
import { klinikQrBilgisiGetir } from "@/lib/qr/klinik-bilgisi";
import { qrKoduAktifMi } from "@/lib/qr/qr-kod-aktif-mi";
import { KamuFormKarti, KamuFormBulunamadi } from "@/components/panel/kamu-form-karti";
import { PinFormu } from "./pin-formu";

export default async function PuantajSayfasi({
  params,
}: {
  params: Promise<{ kisaKod: string; tur: string }>;
}) {
  const { kisaKod, tur } = await params;

  if (tur !== "giris" && tur !== "cikis") {
    notFound();
  }

  const klinik = await klinikQrBilgisiGetir(kisaKod);

  if (!klinik) {
    return <KamuFormBulunamadi />;
  }

  const tip = tur === "giris" ? "puantaj_giris" : "puantaj_cikis";
  const aktif = await qrKoduAktifMi(klinik.id, tip);

  const baslik = tur === "giris" ? "Personel Girişi" : "Personel Çıkışı";

  if (!aktif) {
    return (
      <KamuFormKarti klinikAd={klinik.ad} baslik="Kullanım Dışı" aciklama="Bu form şu anda geçici olarak kapatılmış.">
        <p className="text-sm text-muted-foreground">Lütfen resepsiyon ile iletişime geçin.</p>
      </KamuFormKarti>
    );
  }

  return (
    <KamuFormKarti klinikAd={klinik.ad} baslik={baslik} aciklama="Puantaj PIN'inizi girin.">
      <PinFormu klinikId={klinik.id} tur={tur} />
    </KamuFormKarti>
  );
}

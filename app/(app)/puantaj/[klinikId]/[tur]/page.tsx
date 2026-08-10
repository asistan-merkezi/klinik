import { notFound } from "next/navigation";
import { klinikAdGetir } from "@/lib/qr/klinik-bilgisi";
import { qrKoduAktifMi } from "@/lib/qr/qr-kod-aktif-mi";
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

  const tip = tur === "giris" ? "puantaj_giris" : "puantaj_cikis";
  const [klinikAd, aktif] = await Promise.all([klinikAdGetir(klinikId), qrKoduAktifMi(klinikId, tip)]);

  if (!klinikAd) {
    return <KamuFormBulunamadi />;
  }

  const baslik = tur === "giris" ? "Personel Girişi" : "Personel Çıkışı";

  if (!aktif) {
    return (
      <KamuFormKarti klinikAd={klinikAd} baslik="Kullanım Dışı" aciklama="Bu form şu anda geçici olarak kapatılmış.">
        <p className="text-sm text-muted-foreground">Lütfen resepsiyon ile iletişime geçin.</p>
      </KamuFormKarti>
    );
  }

  return (
    <KamuFormKarti klinikAd={klinikAd} baslik={baslik} aciklama="Puantaj PIN'inizi girin.">
      <PinFormu klinikId={klinikId} tur={tur} />
    </KamuFormKarti>
  );
}

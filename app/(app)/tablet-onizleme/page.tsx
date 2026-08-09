import type { RandevuSatir } from "@/types/randevu";
import type { Klinik } from "@/types/klinik";
import { VARSAYILAN_TABLET_AYARLARI, type TabletAyarlari, type TabletTemasi } from "@/types/tablet-ayarlari";
import { TabletEkrani } from "../panel/tablet/[odaId]/tablet-ekrani";

const ORNEK_KLINIK: Klinik = {
  ad: "Örnek Klinik",
  logo_url: null,
  logo_url_koyu: null,
  marka_renkleri: { primary: "#2B7FD4" },
};

function dakikaSonra(dakika: number): string {
  return new Date(Date.now() + dakika * 60_000).toISOString();
}

function ornekRandevular(durum: string): RandevuSatir[] {
  if (durum === "hazirlaniyor") {
    return [
      {
        id: "onizleme-1",
        baslangic: dakikaSonra(10),
        bitis: dakikaSonra(40),
        durum: "planlandi",
        hasta: { ad_soyad: "Ahmet Yılmaz" },
        oda: { ad: "Oda 1" },
        terapist: { personel: { ad_soyad: "Fzt. Ayşe Kaya" } },
        islem_tanimi: { id: "1", ad: "Manuel Terapi" },
      },
    ];
  }

  if (durum === "mesgul") {
    return [
      {
        id: "onizleme-1",
        baslangic: dakikaSonra(-20),
        bitis: dakikaSonra(25),
        durum: "geldi",
        hasta: { ad_soyad: "Ahmet Yılmaz" },
        oda: { ad: "Oda 1" },
        terapist: { personel: { ad_soyad: "Fzt. Ayşe Kaya" } },
        islem_tanimi: { id: "1", ad: "Manuel Terapi" },
      },
    ];
  }

  // musait: hasta yok, ama uzak bir sıradaki randevu var (eşik dışı, "Sıradaki:" alt satırını göstermek için)
  return [
    {
      id: "onizleme-1",
      baslangic: dakikaSonra(180),
      bitis: dakikaSonra(210),
      durum: "planlandi",
      hasta: { ad_soyad: "Ahmet Yılmaz" },
      oda: { ad: "Oda 1" },
      terapist: { personel: { ad_soyad: "Fzt. Ayşe Kaya" } },
      islem_tanimi: { id: "1", ad: "Manuel Terapi" },
    },
  ];
}

/**
 * Kimlik doğrulamasız QA/tasarım-kontrol rotası — kapı tableti ekranının 3
 * durumunu (Müsait/Hazırlanıyor/Seans sürüyor) ve iki temasını sahte veriyle
 * ekran görüntüsü almak için. Navigasyona bağlı değil, sadece bu URL'i
 * bilenler erişir. `/kayit`, `/anket` gibi bu (app) route group'undaki diğer
 * anon rotalarla aynı desende — panel/portal'ın aksine kendi auth kontrolünü
 * yapmıyor.
 */
export default async function TabletOnizlemeSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; tema?: string }>;
}) {
  const { durum: durumParam, tema: temaParam } = await searchParams;
  const durum = durumParam === "hazirlaniyor" || durumParam === "mesgul" ? durumParam : "musait";
  const tema: TabletTemasi = temaParam === "acik" ? "acik" : "koyu";

  const ayarlar: TabletAyarlari = { ...VARSAYILAN_TABLET_AYARLARI, tema };

  return (
    <TabletEkrani
      odaId="onizleme"
      odaAdi="Oda 1"
      klinik={ORNEK_KLINIK}
      baslangicRandevular={ornekRandevular(durum)}
      ayarlar={ayarlar}
      canliBaglanti={false}
    />
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";
import type { MusteriDetay } from "@/types/musteri";
import type { MusteriOzet } from "@/types/musteri-detay";
import type { SatilabilirUrun, PaketSatisSatir, OdemeGecmisSatir } from "@/types/odeme";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import type { MusteriBakiyeHareket } from "@/types/musteri-detay";
import { RiskBandi } from "./risk-bandi";
import { OzetKart } from "./ozet-kart";
import { GenelBilgilerSekmesi } from "./sekmeler/genel-bilgiler-sekmesi";
import { RandevuSeansSekmesi } from "./sekmeler/randevu-seans-sekmesi";
import { TedaviAnamnezSekmesi } from "./sekmeler/tedavi-anamnez-sekmesi";
import { GelisimOlcumlerSekmesi } from "./sekmeler/gelisim-olcumler-sekmesi";
import { CariOdemeSekmesi } from "./sekmeler/cari-odeme-sekmesi";
import { BelgelerMedyaSekmesi } from "./sekmeler/belgeler-medya-sekmesi";
import { PlaceholderSekmesi } from "./sekmeler/placeholder-sekmesi";

type SekmeAnahtari = "genel" | "randevu" | "tedavi" | "gelisim" | "cari" | "belgeler" | "iletisim";

const SEKMELER: { deger: SekmeAnahtari; etiket: string; terapisteKapali?: boolean }[] = [
  { deger: "genel", etiket: "Genel Bilgiler" },
  { deger: "randevu", etiket: "Randevu & Seans" },
  { deger: "tedavi", etiket: "Tedavi & Anamnez" },
  { deger: "gelisim", etiket: "Gelişim & Ölçümler" },
  { deger: "cari", etiket: "Cari & Ödeme", terapisteKapali: true },
  { deger: "belgeler", etiket: "Belgeler & Medya" },
  { deger: "iletisim", etiket: "İletişim & Bildirimler" },
];

export function MusteriDetayIcerik({
  musteri,
  ozet,
  vasTrend,
  rol,
  duzenlenebilir,
  portalDurumu,
  periyodikRandevular,
  aktifPaketler,
  satilabilirUrunler,
  odemeGecmisi,
  bakiyeHareketleri,
}: {
  musteri: MusteriDetay;
  ozet: MusteriOzet | null;
  vasTrend: "yukari" | "asagi" | "sabit" | null;
  rol: string | null;
  duzenlenebilir: boolean;
  portalDurumu: { var: boolean; aktif: boolean };
  periyodikRandevular: PeriyodikRandevuSatir[];
  aktifPaketler: PaketSatisSatir[];
  satilabilirUrunler: SatilabilirUrun[];
  odemeGecmisi: OdemeGecmisSatir[];
  bakiyeHareketleri: MusteriBakiyeHareket[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const gecerliDegerler = SEKMELER.map((s) => s.deger);
  const urlTab = searchParams.get("tab");
  const aktifSekme: SekmeAnahtari = gecerliDegerler.includes(urlTab as SekmeAnahtari)
    ? (urlTab as SekmeAnahtari)
    : "genel";

  const terapistMi = rol === "terapist";
  const gorunurSekmeler = SEKMELER.filter((s) => !(s.terapisteKapali && terapistMi));

  function sekmeDegistir(deger: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", deger);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-4">
      <RiskBandi musteriId={musteri.id} riskBayraklari={musteri.risk_bayraklari} eklenebilir={duzenlenebilir || terapistMi} />

      <OzetKart
        adSoyad={musteri.ad_soyad}
        telefon={musteri.telefon}
        dogumTarihi={musteri.dogum_tarihi}
        ozet={ozet}
        vasTrend={vasTrend}
      />

      <Tabs value={aktifSekme} onValueChange={(v) => sekmeDegistir(v as string)}>
        <TabsList>
          {gorunurSekmeler.map((s) => (
            <TabsTrigger key={s.deger} value={s.deger}>
              {s.etiket}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsPanel value="genel">
          <GenelBilgilerSekmesi
            musteri={musteri}
            aktif={aktifSekme === "genel"}
            duzenlenebilir={duzenlenebilir}
            portalDurumu={portalDurumu}
          />
        </TabsPanel>

        <TabsPanel value="randevu">
          {aktifSekme === "randevu" && (
            <RandevuSeansSekmesi
              musteriId={musteri.id}
              duzenlenebilir={duzenlenebilir}
              periyodikRandevular={periyodikRandevular}
            />
          )}
        </TabsPanel>

        <TabsPanel value="tedavi">
          <TedaviAnamnezSekmesi
            musteri={musteri}
            aktif={aktifSekme === "tedavi"}
            duzenlenebilir={duzenlenebilir || terapistMi}
            sonVasSkoru={ozet?.son_vas_skoru ?? null}
          />
        </TabsPanel>

        <TabsPanel value="gelisim">
          <GelisimOlcumlerSekmesi
            musteriId={musteri.id}
            sonVasSkoru={ozet?.son_vas_skoru ?? null}
            aktif={aktifSekme === "gelisim"}
          />
        </TabsPanel>

        {!terapistMi && (
          <TabsPanel value="cari">
            {aktifSekme === "cari" && (
              <CariOdemeSekmesi
                musteriId={musteri.id}
                duzenlenebilir={duzenlenebilir}
                aktifPaketler={aktifPaketler}
                satilabilirUrunler={satilabilirUrunler}
                odemeGecmisi={odemeGecmisi}
                bakiyeHareketleri={bakiyeHareketleri}
              />
            )}
          </TabsPanel>
        )}

        <TabsPanel value="belgeler">
          <BelgelerMedyaSekmesi musteriId={musteri.id} rol={rol} aktif={aktifSekme === "belgeler"} />
        </TabsPanel>

        <TabsPanel value="iletisim">
          {aktifSekme === "iletisim" && (
            <PlaceholderSekmesi
              baslik="İletişim & Bildirimler"
              aciklama="Bu sekme yakında eklenecek: iletişim geçmişi, hızlı WhatsApp/SMS, anket sonuçları, randevu öncesi form cevapları."
            />
          )}
        </TabsPanel>
      </Tabs>
    </div>
  );
}

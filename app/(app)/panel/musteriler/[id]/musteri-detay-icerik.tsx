"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";
import type { MusteriDetay } from "@/types/musteri";
import type { MusteriOzet } from "@/types/musteri-detay";
import type { SatilabilirUrun, PaketSatisSatir, OdemeGecmisSatir } from "@/types/odeme";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import type { MusteriBakiyeHareket } from "@/types/musteri-detay";
import { RiskBandi } from "./risk-bandi";
import { OzetKart } from "./ozet-kart";
import { MobilHub } from "./mobil-hub";
import { KisiselBilgilerSekmesi } from "./sekmeler/kisisel-bilgiler-sekmesi";
import { RandevuSeansSekmesi } from "./sekmeler/randevu-seans-sekmesi";
import { TedaviAnamnezSekmesi } from "./sekmeler/tedavi-anamnez-sekmesi";
import { CariOdemeSekmesi } from "./sekmeler/cari-odeme-sekmesi";
import { useMusteriDetayOzet } from "./queries";
import { SEKMELER, type SekmeAnahtari } from "./sekme-tanimlari";

export function MusteriDetayIcerik({
  musteri,
  ozet,
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
  const { data: detayOzet, isLoading: detayOzetYukleniyor } = useMusteriDetayOzet(musteri.id);

  const gecerliDegerler = SEKMELER.map((s) => s.deger);
  const urlTab = searchParams.get("tab");
  const tabParamGecerli = gecerliDegerler.includes(urlTab as SekmeAnahtari);
  const aktifSekme: SekmeAnahtari = tabParamGecerli ? (urlTab as SekmeAnahtari) : "kisisel";

  const terapistMi = rol === "terapist";
  const gorunurSekmeler = SEKMELER.filter((s) => !(s.terapisteKapali && terapistMi));

  function sekmeDegistir(deger: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", deger);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function mobilKartTikla(deger: SekmeAnahtari) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", deger);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function sekmeIcerigi(sekme: SekmeAnahtari) {
    switch (sekme) {
      case "kisisel":
        return (
          <KisiselBilgilerSekmesi
            musteri={musteri}
            aktif={aktifSekme === "kisisel"}
            duzenlenebilir={duzenlenebilir}
            portalDurumu={portalDurumu}
          />
        );
      case "randevu":
        return aktifSekme === "randevu" ? (
          <RandevuSeansSekmesi
            musteriId={musteri.id}
            duzenlenebilir={duzenlenebilir}
            periyodikRandevular={periyodikRandevular}
          />
        ) : null;
      case "tedavi":
        return (
          <TedaviAnamnezSekmesi
            musteri={musteri}
            aktif={aktifSekme === "tedavi"}
            duzenlenebilir={duzenlenebilir || terapistMi}
            sonVasSkoru={ozet?.son_vas_skoru ?? null}
            rol={rol}
          />
        );
      case "cari":
        return !terapistMi && aktifSekme === "cari" ? (
          <CariOdemeSekmesi
            musteriId={musteri.id}
            duzenlenebilir={duzenlenebilir}
            aktifPaketler={aktifPaketler}
            satilabilirUrunler={satilabilirUrunler}
            odemeGecmisi={odemeGecmisi}
            bakiyeHareketleri={bakiyeHareketleri}
          />
        ) : null;
      default:
        return null;
    }
  }

  const aktifSekmeEtiket = SEKMELER.find((s) => s.deger === aktifSekme)?.etiket ?? "";

  return (
    <div className="flex flex-col gap-4">
      <RiskBandi musteriId={musteri.id} riskBayraklari={musteri.risk_bayraklari} eklenebilir={duzenlenebilir || terapistMi} />

      <OzetKart
        adSoyad={musteri.ad_soyad}
        telefon={musteri.telefon}
        dogumTarihi={musteri.dogum_tarihi}
        cinsiyet={musteri.cinsiyet}
      />

      {/* Mobil hub (md altı): sekme barı yerine özet kart grid'i */}
      <div className="md:hidden">
        {tabParamGecerli ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
              Geri
            </button>
            <h2 className="text-base font-semibold">{aktifSekmeEtiket}</h2>
            {sekmeIcerigi(aktifSekme)}
          </div>
        ) : (
          <MobilHub
            musteri={musteri}
            ozet={ozet}
            detayOzet={detayOzet}
            yukleniyor={detayOzetYukleniyor}
            gorunurSekmeler={gorunurSekmeler}
            onKartTikla={mobilKartTikla}
          />
        )}
      </div>

      {/* Masaüstü sekmeler (md ve üzeri): mevcut 7 sekmeli yapı */}
      <div className="hidden md:block">
        <Tabs value={aktifSekme} onValueChange={(v) => sekmeDegistir(v as string)}>
          <TabsList>
            {gorunurSekmeler.map((s) => (
              <TabsTrigger key={s.deger} value={s.deger}>
                {s.etiket}
              </TabsTrigger>
            ))}
          </TabsList>

          {gorunurSekmeler.map((s) => (
            <TabsPanel key={s.deger} value={s.deger}>
              {sekmeIcerigi(s.deger)}
            </TabsPanel>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

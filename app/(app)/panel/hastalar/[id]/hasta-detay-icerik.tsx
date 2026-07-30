"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { HastaDetay } from "@/types/hasta";
import type { HastaOzet } from "@/types/hasta-detay";
import type { SatilabilirUrun, PaketSatisSatir, OdemeGecmisSatir } from "@/types/odeme";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import type { HastaBakiyeHareket } from "@/types/hasta-detay";
import type { SecenekSatir } from "@/types/randevu";
import { RiskBandi } from "./risk-bandi";
import { OzetKart } from "./ozet-kart";
import { SekmeKartlari } from "./sekme-kartlari";
import { KisiselBilgilerSekmesi } from "./sekmeler/kisisel-bilgiler-sekmesi";
import { RandevuSeansSekmesi } from "./sekmeler/randevu-seans-sekmesi";
import { TedaviAnamnezSekmesi } from "./sekmeler/tedavi-anamnez-sekmesi";
import { CariOdemeSekmesi } from "./sekmeler/cari-odeme-sekmesi";
import { useHastaDetayOzet } from "./queries";
import { SEKMELER, type SekmeAnahtari } from "./sekme-tanimlari";

export function HastaDetayIcerik({
  hasta,
  ozet,
  rol,
  duzenlenebilir,
  portalDurumu,
  periyodikRandevular,
  aktifPaketler,
  satilabilirUrunler,
  odemeGecmisi,
  bakiyeHareketleri,
  terapistler,
  odalar,
  cihazlar,
  tedaviler,
}: {
  hasta: HastaDetay;
  ozet: HastaOzet | null;
  rol: string | null;
  duzenlenebilir: boolean;
  portalDurumu: { var: boolean; aktif: boolean };
  periyodikRandevular: PeriyodikRandevuSatir[];
  aktifPaketler: PaketSatisSatir[];
  satilabilirUrunler: SatilabilirUrun[];
  odemeGecmisi: OdemeGecmisSatir[];
  bakiyeHareketleri: HastaBakiyeHareket[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: detayOzet, isLoading: detayOzetYukleniyor } = useHastaDetayOzet(hasta.id);

  const gecerliDegerler = SEKMELER.map((s) => s.deger);
  const urlTab = searchParams.get("tab");
  const tabParamGecerli = gecerliDegerler.includes(urlTab as SekmeAnahtari);
  const aktifSekme: SekmeAnahtari = tabParamGecerli ? (urlTab as SekmeAnahtari) : "kisisel";

  const terapistMi = rol === "terapist";
  const gorunurSekmeler = SEKMELER.filter((s) => !(s.terapisteKapali && terapistMi));

  function sekmeDegistir(deger: SekmeAnahtari) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", deger);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function sekmeIcerigi(sekme: SekmeAnahtari) {
    switch (sekme) {
      case "kisisel":
        return (
          <KisiselBilgilerSekmesi
            hasta={hasta}
            aktif={aktifSekme === "kisisel"}
            duzenlenebilir={duzenlenebilir}
            portalDurumu={portalDurumu}
          />
        );
      case "randevu":
        return aktifSekme === "randevu" ? (
          <RandevuSeansSekmesi
            hastaId={hasta.id}
            hastaAdSoyad={hasta.ad_soyad}
            duzenlenebilir={duzenlenebilir}
            periyodikRandevular={periyodikRandevular}
            terapistler={terapistler}
            odalar={odalar}
            cihazlar={cihazlar}
            tedaviler={tedaviler}
          />
        ) : null;
      case "tedavi":
        return (
          <TedaviAnamnezSekmesi
            hasta={hasta}
            aktif={aktifSekme === "tedavi"}
            duzenlenebilir={duzenlenebilir || terapistMi}
            sonVasSkoru={ozet?.son_vas_skoru ?? null}
            rol={rol}
          />
        );
      case "cari":
        return !terapistMi && aktifSekme === "cari" ? (
          <CariOdemeSekmesi
            hastaId={hasta.id}
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
      <RiskBandi hastaId={hasta.id} riskBayraklari={hasta.risk_bayraklari} eklenebilir={duzenlenebilir || terapistMi} />

      <OzetKart
        adSoyad={hasta.ad_soyad}
        telefon={hasta.telefon}
        dogumTarihi={hasta.dogum_tarihi}
        cinsiyet={hasta.cinsiyet}
      />

      <SekmeKartlari
        hasta={hasta}
        ozet={ozet}
        detayOzet={detayOzet}
        yukleniyor={detayOzetYukleniyor}
        gorunurSekmeler={gorunurSekmeler}
        aktifSekme={aktifSekme}
        onKartTikla={sekmeDegistir}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{aktifSekmeEtiket}</h2>
        {sekmeIcerigi(aktifSekme)}
      </div>
    </div>
  );
}

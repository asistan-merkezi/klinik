"use client";

import {
  User,
  CalendarDays,
  ClipboardList,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { ModuleCard } from "@/components/panel/module-card";
import type { HastaOzet, HastaDetayOzet } from "@/types/hasta-detay";
import type { SekmeAnahtari } from "./sekme-tanimlari";
import type { HastaTemel } from "./hasta-getir";
import { useHastaDetayOzet } from "./queries";

const IKONLAR: Record<SekmeAnahtari, LucideIcon> = {
  kisisel: User,
  randevu: CalendarDays,
  tedavi: ClipboardList,
  cari: CreditCard,
};

function randevuZamani(tarih: string): string {
  const d = new Date(tarih);
  const tarihMetni = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
  const saatMetni = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return `Sonraki: ${tarihMetni} ${saatMetni}`;
}

function ozetDegeri(
  sekme: SekmeAnahtari,
  hasta: HastaTemel,
  ozet: HastaOzet | null,
  detayOzet: HastaDetayOzet | null | undefined,
  yukleniyor: boolean
): { deger: string; uyari?: boolean } {
  switch (sekme) {
    case "kisisel": {
      const eksikOnay = !hasta.kvkk_onay_tarihi || !hasta.ozel_nitelikli_veri_onay_tarihi;
      return { deger: "Kişisel bilgiler & iletişim", uyari: eksikOnay };
    }
    case "randevu": {
      if (yukleniyor) return { deger: "Yükleniyor…" };
      return { deger: detayOzet?.sonraki_randevu_tarihi ? randevuZamani(detayOzet.sonraki_randevu_tarihi) : "Randevu yok" };
    }
    case "tedavi": {
      if (yukleniyor) return { deger: "Yükleniyor…" };
      const ad = detayOzet?.aktif_protokol_ad;
      if (ad) {
        const kisaltilmis = ad.length > 24 ? `${ad.slice(0, 24)}…` : ad;
        return { deger: `Aktif tanı: ${kisaltilmis}` };
      }
      const olcum = detayOzet?.olcum_sayisi ?? 0;
      const belge = detayOzet?.belge_sayisi ?? 0;
      return { deger: `${olcum} ölçüm · ${belge} belge` };
    }
    case "cari": {
      const bakiye = ozet?.bakiye ?? 0;
      return { deger: bakiye.toLocaleString("tr-TR", { style: "currency", currency: "TRY" }) };
    }
  }
}

export function SekmeKartlari({
  hasta,
  ozet,
  gorunurSekmeler,
}: {
  hasta: HastaTemel;
  ozet: HastaOzet | null;
  gorunurSekmeler: { deger: SekmeAnahtari; etiket: string }[];
}) {
  const { data: detayOzet, isLoading: yukleniyor } = useHastaDetayOzet(hasta.id);
  const tekKalanKartVar = gorunurSekmeler.length % 2 === 1;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {gorunurSekmeler.map((s, i) => {
        const { deger, uyari } = ozetDegeri(s.deger, hasta, ozet, detayOzet, yukleniyor);
        const sonKartTek = tekKalanKartVar && i === gorunurSekmeler.length - 1;
        return (
          <ModuleCard
            key={s.deger}
            icon={IKONLAR[s.deger]}
            label={s.etiket}
            subtitle={deger}
            warning={uyari}
            href={`/panel/hastalar/${hasta.id}/${s.deger}`}
            className={sonKartTek ? "col-span-2 mx-auto w-1/2 sm:col-span-1 sm:w-auto" : undefined}
          />
        );
      })}
    </div>
  );
}

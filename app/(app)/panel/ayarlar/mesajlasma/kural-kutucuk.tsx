"use client";

import { useState } from "react";
import { Users, CalendarDays, UserCog, Wallet, type LucideIcon } from "lucide-react";
import { ModuleCard } from "@/components/panel/module-card";
import type { IconTileTone } from "@/components/ui/icon-tile";
import { KANAL_SIRASI, KANAL_ETIKET, type MesajBolum, type MesajKuralSatir } from "@/types/mesajlasma";
import { KuralDuzenleDialog } from "./kural-duzenle-dialog";

const KANAL_ALAN = {
  sms: "sms_aktif",
  whatsapp: "whatsapp_aktif",
  mail: "mail_aktif",
} as const;

// Icon bileşenleri (fonksiyon referansları) bir Server Component'ten Client
// Component'e prop olarak GEÇİRİLEMEZ ("Functions cannot be passed directly
// to Client Components") — bu yüzden bölüm ikon/tonu page.tsx'ten prop olarak
// almak yerine burada, client bundle içinde, kural.bolum'a göre çözülüyor
// (hastalar/[id]/sekme-kartlari.tsx'teki IKONLAR/TONLAR deseniyle aynı).
const BOLUM_GORUNUM: Record<MesajBolum, { icon: LucideIcon; tone: IconTileTone }> = {
  hasta: { icon: Users, tone: "blue" },
  randevu: { icon: CalendarDays, tone: "cyan" },
  personel: { icon: UserCog, tone: "violet" },
  muhasebe: { icon: Wallet, tone: "amber" },
};

export function KuralKutucuk({ kural: baslangicKural }: { kural: MesajKuralSatir }) {
  const [acik, setAcik] = useState(false);
  const [kural, setKural] = useState(baslangicKural);
  const { icon, tone } = BOLUM_GORUNUM[kural.bolum];

  const aktifKanallar = KANAL_SIRASI.filter((k) => kural[KANAL_ALAN[k]]);
  const metniBos = kural.mesaj_metni.trim().length === 0;

  const subtitle = !kural.aktif
    ? "Pasif"
    : aktifKanallar.length === 0
      ? "Kanal seçilmedi"
      : aktifKanallar.map((k) => KANAL_ETIKET[k]).join(", ");

  return (
    <>
      <ModuleCard
        icon={icon}
        tone={tone}
        label={kural.tetikleyici_adi}
        subtitle={subtitle}
        subtitleTone={!kural.aktif || aktifKanallar.length === 0 ? "rose" : undefined}
        warning={metniBos}
        dot={metniBos ? undefined : kural.aktif ? "emerald" : "muted"}
        onClick={() => setAcik(true)}
        className={!kural.aktif ? "opacity-60" : undefined}
      />
      <KuralDuzenleDialog acik={acik} onOpenChange={setAcik} kural={kural} onGuncelle={setKural} />
    </>
  );
}

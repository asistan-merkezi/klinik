"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ModuleCard } from "@/components/panel/module-card";
import type { IconTileTone } from "@/components/ui/icon-tile";
import { KANAL_SIRASI, KANAL_ETIKET, type MesajKuralSatir } from "@/types/mesajlasma";
import { KuralDuzenleDialog } from "./kural-duzenle-dialog";

const KANAL_ALAN = {
  sms: "sms_aktif",
  whatsapp: "whatsapp_aktif",
  mail: "mail_aktif",
} as const;

export function KuralKutucuk({
  kural: baslangicKural,
  icon,
  tone,
}: {
  kural: MesajKuralSatir;
  icon: LucideIcon;
  tone: IconTileTone;
}) {
  const [acik, setAcik] = useState(false);
  const [kural, setKural] = useState(baslangicKural);

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

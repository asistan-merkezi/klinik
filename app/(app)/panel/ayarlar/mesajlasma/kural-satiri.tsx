"use client";

import { useState } from "react";
import { Check, Minus, Users, CalendarDays, UserCog, Wallet, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { IconTile, type IconTileTone } from "@/components/ui/icon-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { KANAL_SIRASI, KANAL_ETIKET, type MesajBolum, type EtkinMesajKurali } from "@/types/mesajlasma";
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

export function KuralSatiri({ kural: baslangicKural }: { kural: EtkinMesajKurali }) {
  const [acik, setAcik] = useState(false);
  const [kural, setKural] = useState(baslangicKural);
  const { icon: Icon, tone } = BOLUM_GORUNUM[kural.bolum];

  const metniBos = kural.mesaj_metni.trim().length === 0;

  return (
    <li>
      <Card
        interactive
        className={cn("flex-col gap-3 p-3 sm:flex-row sm:items-center", !kural.aktif && "opacity-60")}
        onClick={() => setAcik(true)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <IconTile icon={Icon} tone={tone} className="shrink-0" />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium">{kural.tetikleyici_adi}</span>
            <div className="flex flex-wrap items-center gap-1">
              {!kural.aktif && (
                <StatusBadge tone="slate" className="border border-border">
                  Pasif
                </StatusBadge>
              )}
              {metniBos && (
                <StatusBadge tone="amber" className="border border-amber-500/30">
                  Mesaj metni eksik
                </StatusBadge>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-[52px] sm:justify-end sm:pl-0">
          {KANAL_SIRASI.map((kanal) => {
            const kanalAktif = kural[KANAL_ALAN[kanal]];
            return (
              <StatusBadge
                key={kanal}
                tone={kanalAktif ? "emerald" : "slate"}
                className={cn("border", kanalAktif ? "border-emerald-500/30" : "border-border text-muted-foreground/60")}
              >
                {kanalAktif ? <Check className="size-3" aria-hidden /> : <Minus className="size-3" aria-hidden />}
                {KANAL_ETIKET[kanal]}
              </StatusBadge>
            );
          })}
        </div>
      </Card>

      <KuralDuzenleDialog acik={acik} onOpenChange={setAcik} kural={kural} onGuncelle={setKural} />
    </li>
  );
}

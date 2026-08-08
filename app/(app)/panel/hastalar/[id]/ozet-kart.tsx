"use client";

import { useState } from "react";
import { Phone, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { telefonGoster } from "@/lib/utils";
import { RiskDetayModal } from "./risk-bandi";
import type { Cinsiyet } from "@/types/hasta";

function yasHesapla(dogumTarihi: string | null): number | null {
  if (!dogumTarihi) return null;
  const dogum = new Date(dogumTarihi);
  const bugun = new Date();
  let yas = bugun.getFullYear() - dogum.getFullYear();
  const ayFarki = bugun.getMonth() - dogum.getMonth();
  if (ayFarki < 0 || (ayFarki === 0 && bugun.getDate() < dogum.getDate())) {
    yas--;
  }
  return yas;
}

const CINSIYET_ETIKETLERI: Record<Cinsiyet, string | null> = {
  kadin: "Kadın",
  erkek: "Erkek",
  belirtilmemis: null,
};

export function OzetKart({
  hastaId,
  adSoyad,
  telefon,
  dogumTarihi,
  cinsiyet,
  riskBayraklariBos,
  eklenebilir,
}: {
  hastaId: string;
  adSoyad: string;
  telefon: string;
  dogumTarihi: string | null;
  cinsiyet: Cinsiyet | null;
  riskBayraklariBos: boolean;
  eklenebilir: boolean;
}) {
  const [modalAcik, setModalAcik] = useState(false);
  const [formAcik, setFormAcik] = useState(false);
  const yas = yasHesapla(dogumTarihi);
  const cinsiyetEtiketi = cinsiyet ? CINSIYET_ETIKETLERI[cinsiyet] : null;

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{adSoyad}</h1>
            {cinsiyetEtiketi && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                {cinsiyetEtiketi}
              </span>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="size-3.5 shrink-0 text-primary" aria-hidden />
            <a href={`tel:${telefon}`} className="tabular-nums hover:text-foreground">
              {telefonGoster(telefon)}
            </a>
            {yas != null && <span className="tabular-nums">· {yas} yaşında</span>}
          </p>
        </div>

        {riskBayraklariBos && eklenebilir && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-3 text-muted-foreground"
              onClick={() => {
                setModalAcik(true);
                setFormAcik(true);
              }}
            >
              <ShieldAlert className="size-4" aria-hidden />
              Risk Bayrağı
            </Button>
            <RiskDetayModal
              acik={modalAcik}
              onOpenChange={setModalAcik}
              hastaId={hastaId}
              riskBayraklari={[]}
              eklenebilir={eklenebilir}
              formAcik={formAcik}
              setFormAcik={setFormAcik}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HastaDetay } from "@/types/hasta";
import { VucutHaritasi } from "@/components/hasta/vucut-haritasi";
import { ProtokolKarti } from "../protokol-karti";
import { SeansGecmisiZamanCizelgesi } from "../seans-gecmisi-zaman-cizelgesi";
import { SikayetAnamnezKarti } from "../sikayet-anamnez-karti";
import { GelisimOlcumlerSekmesi } from "./gelisim-olcumler-sekmesi";
import { BelgelerMedyaSekmesi } from "./belgeler-medya-sekmesi";

type IcSekme = "tedavi" | "gelisim" | "belgeler";

const IC_SEKMELER: { deger: IcSekme; etiket: string }[] = [
  { deger: "tedavi", etiket: "Tedavi & Anamnez" },
  { deger: "gelisim", etiket: "Gelişim & Ölçümler" },
  { deger: "belgeler", etiket: "Belgeler & Medya" },
];

export function TedaviAnamnezSekmesi({
  hasta,
  aktif,
  duzenlenebilir,
  sonVasSkoru,
  rol,
}: {
  hasta: HastaDetay;
  aktif: boolean;
  duzenlenebilir: boolean;
  sonVasSkoru: number | null;
  rol: string | null;
}) {
  const [icSekme, setIcSekme] = useState<IcSekme>("tedavi");
  const [seciliSeansId, setSeciliSeansId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1">
        {IC_SEKMELER.map((s) => (
          <button
            key={s.deger}
            type="button"
            onClick={() => setIcSekme(s.deger)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              icSekme === s.deger
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {s.etiket}
          </button>
        ))}
      </div>

      {icSekme === "tedavi" && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent>
              <SikayetAnamnezKarti hastaId={hasta.id} aktif={aktif} duzenlenebilir={duzenlenebilir} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Seans / Tedavi Geçmişi</CardTitle>
            </CardHeader>
            <CardContent>
              <SeansGecmisiZamanCizelgesi
                hastaId={hasta.id}
                aktif={aktif}
                seciliSeansId={seciliSeansId}
                onSeansSec={setSeciliSeansId}
                duzenlenebilir={duzenlenebilir}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2D Vücut Haritası</CardTitle>
            </CardHeader>
            <CardContent>
              <VucutHaritasi
                hastaId={hasta.id}
                seansId={seciliSeansId}
                duzenlenebilir={duzenlenebilir}
                cinsiyet={hasta.cinsiyet}
                aktif={aktif}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Protokoller</CardTitle>
            </CardHeader>
            <CardContent>
              <ProtokolKarti hastaId={hasta.id} riskBayraklari={hasta.risk_bayraklari} aktif={aktif} />
            </CardContent>
          </Card>
        </div>
      )}

      {icSekme === "gelisim" && (
        <GelisimOlcumlerSekmesi
          hastaId={hasta.id}
          sonVasSkoru={sonVasSkoru}
          aktif={aktif}
          duzenlenebilir={duzenlenebilir}
        />
      )}

      {icSekme === "belgeler" && <BelgelerMedyaSekmesi hastaId={hasta.id} rol={rol} aktif={aktif} />}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { VucutHaritasi } from "@/components/hasta/vucut-haritasi";
import { TrendGrafik } from "@/components/hasta/trend-grafik";
import type { HastaDetay } from "@/types/hasta";
import { ProtokolKarti } from "../protokol-karti";
import { HedefListesi } from "../hedef-listesi";
import { SeansGecmisiZamanCizelgesi } from "../seans-gecmisi-zaman-cizelgesi";
import { useHastaOlcumler } from "../queries";
import { GelisimOlcumlerSekmesi } from "./gelisim-olcumler-sekmesi";
import { BelgelerMedyaSekmesi } from "./belgeler-medya-sekmesi";

type AltSekme = "gelisim" | "belgeler";

const ALT_SEKMELER: { deger: AltSekme; etiket: string }[] = [
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
  const [seciliSeansId, setSeciliSeansId] = useState<string | null>(null);
  const [altSekme, setAltSekme] = useState<AltSekme>("gelisim");

  const { data: olcumler } = useHastaOlcumler(hasta.id, aktif);

  const vasNoktalari = useMemo(
    () =>
      (olcumler ?? [])
        .filter((o) => o.olcek_tanimi?.kod === "VAS" && o.hesaplanan_skor != null)
        .map((o) => ({ tarih: o.olcum_tarihi, deger: o.hesaplanan_skor as number })),
    [olcumler]
  );

  const vasOzeti = useMemo(() => {
    if (vasNoktalari.length < 2) return null;
    const ilk = vasNoktalari[0].deger;
    const son = vasNoktalari[vasNoktalari.length - 1].deger;
    const fark = ilk - son;
    if (fark > 0) return { yon: "azaldi" as const, miktar: fark };
    if (fark < 0) return { yon: "arttı" as const, miktar: Math.abs(fark) };
    return { yon: "aynı" as const, miktar: 0 };
  }, [vasNoktalari]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-4 lg:order-1">
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

        <Card>
          <CardContent>
            <HedefListesi hastaId={hasta.id} sonVasSkoru={sonVasSkoru} aktif={aktif} duzenlenebilir={duzenlenebilir} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
            {ALT_SEKMELER.map((s) => (
              <button
                key={s.deger}
                type="button"
                onClick={() => setAltSekme(s.deger)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  altSekme === s.deger
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s.etiket}
              </button>
            ))}
          </div>

          {altSekme === "gelisim" ? (
            <GelisimOlcumlerSekmesi hastaId={hasta.id} sonVasSkoru={sonVasSkoru} aktif={aktif} />
          ) : (
            <BelgelerMedyaSekmesi hastaId={hasta.id} rol={rol} aktif={aktif} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:order-2 lg:h-fit">
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
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>VAS Trendi</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <TrendGrafik noktalar={vasNoktalari} minSkor={0} maksSkor={10} kompakt />
            {vasOzeti && (
              <p className="text-sm text-muted-foreground">
                {vasOzeti.yon === "azaldi" && `↓ ${vasOzeti.miktar} puan · ${vasNoktalari.length} seansta`}
                {vasOzeti.yon === "arttı" && `↑ ${vasOzeti.miktar} puan · ${vasNoktalari.length} seansta`}
                {vasOzeti.yon === "aynı" && `Değişim yok · ${vasNoktalari.length} seansta`}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

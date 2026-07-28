"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VucutHaritasi } from "@/components/musteri/vucut-haritasi";
import type { MusteriDetay } from "@/types/musteri";
import { DetayliBilgilerKarti } from "../detayli-bilgiler-karti";
import { ProtokolKarti } from "../protokol-karti";
import { HedefListesi } from "../hedef-listesi";
import { useMusteriHassas, useVucutHaritasi } from "../queries";

export function TedaviAnamnezSekmesi({
  musteri,
  aktif,
  duzenlenebilir,
  sonVasSkoru,
}: {
  musteri: MusteriDetay;
  aktif: boolean;
  duzenlenebilir: boolean;
  sonVasSkoru: number | null;
}) {
  const { data: hassas, isLoading: hassasYukleniyor } = useMusteriHassas(musteri.id, aktif);
  const { data: isaretler, isLoading: isaretlerYukleniyor } = useVucutHaritasi(musteri.id, aktif);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>2D Vücut Haritası</CardTitle>
        </CardHeader>
        <CardContent>
          {isaretlerYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : (
            <VucutHaritasi musteriId={musteri.id} isaretler={isaretler ?? []} duzenlenebilir={duzenlenebilir} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Protokoller</CardTitle>
        </CardHeader>
        <CardContent>
          <ProtokolKarti musteriId={musteri.id} riskBayraklari={musteri.risk_bayraklari} aktif={aktif} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <HedefListesi musteriId={musteri.id} sonVasSkoru={sonVasSkoru} aktif={aktif} duzenlenebilir={duzenlenebilir} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detaylı Bilgiler & Anamnez</CardTitle>
        </CardHeader>
        <CardContent>
          {hassasYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : (
            <DetayliBilgilerKarti musteri={musteri} hassas={hassas ?? null} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

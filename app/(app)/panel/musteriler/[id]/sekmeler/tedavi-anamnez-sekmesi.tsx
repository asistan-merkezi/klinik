"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VucutHaritasi } from "@/components/musteri/vucut-haritasi";
import type { MusteriDetay } from "@/types/musteri";
import { ProtokolKarti } from "../protokol-karti";
import { HedefListesi } from "../hedef-listesi";
import { useVucutHaritasi } from "../queries";
import { GelisimOlcumlerSekmesi } from "./gelisim-olcumler-sekmesi";
import { BelgelerMedyaSekmesi } from "./belgeler-medya-sekmesi";

export function TedaviAnamnezSekmesi({
  musteri,
  aktif,
  duzenlenebilir,
  sonVasSkoru,
  rol,
}: {
  musteri: MusteriDetay;
  aktif: boolean;
  duzenlenebilir: boolean;
  sonVasSkoru: number | null;
  rol: string | null;
}) {
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

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-muted-foreground">Gelişim & Ölçümler</h3>
        <GelisimOlcumlerSekmesi musteriId={musteri.id} sonVasSkoru={sonVasSkoru} aktif={aktif} />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-muted-foreground">Belgeler & Medya</h3>
        <BelgelerMedyaSekmesi musteriId={musteri.id} rol={rol} aktif={aktif} />
      </div>
    </div>
  );
}

"use client";

import { LineChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendGrafik } from "@/components/hasta/trend-grafik";
import { useHastaKarsilastirma, useHastaOlcumler } from "../queries";
import { KarsilastirmaGalerisi } from "../karsilastirma-galerisi";
import { HedefListesi } from "../hedef-listesi";
import { BelgelerMedyaSekmesi } from "./belgeler-medya-sekmesi";

export function GelisimOlcumlerSekmesi({
  hastaId,
  sonVasSkoru,
  aktif,
  duzenlenebilir,
  rol,
}: {
  hastaId: string;
  sonVasSkoru: number | null;
  aktif: boolean;
  duzenlenebilir: boolean;
  rol: string | null;
}) {
  const { data: olcumler, isLoading: olcumlerYukleniyor } = useHastaOlcumler(hastaId, aktif);
  const { data: karsilastirmalar, isLoading: karsilastirmaYukleniyor } = useHastaKarsilastirma(hastaId, aktif);

  const gruplar = new Map<string, { baslik: string; noktalar: { tarih: string; deger: number }[]; min: number | null; maks: number | null; yon: string }>();

  for (const o of olcumler ?? []) {
    if (o.hesaplanan_skor == null || !o.olcek_tanimi) continue;
    const cevaplar = o.cevaplar as { eklem?: string; hareket?: string } | null;
    const altBaslik =
      o.olcek_tanimi.kod === "ROM" && cevaplar?.eklem
        ? ` (${cevaplar.eklem}${cevaplar.hareket ? " " + cevaplar.hareket : ""})`
        : "";
    const anahtar = `${o.olcek_tanimi.kod}${altBaslik}`;
    const grup = gruplar.get(anahtar) ?? {
      baslik: `${o.olcek_tanimi.ad}${altBaslik}`,
      noktalar: [],
      min: o.olcek_tanimi.min_skor,
      maks: o.olcek_tanimi.max_skor,
      yon: o.olcek_tanimi.yorum_yonu,
    };
    grup.noktalar.push({ tarih: o.olcum_tarihi, deger: o.hesaplanan_skor });
    gruplar.set(anahtar, grup);
  }

  const romGruplariVarMi = Array.from(gruplar.keys()).some((k) => k.startsWith("ROM"));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent>
          <HedefListesi hastaId={hastaId} sonVasSkoru={sonVasSkoru} aktif={aktif} duzenlenebilir={duzenlenebilir} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>VAS / ROM & Ölçek Trendleri</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {olcumlerYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : gruplar.size === 0 ? (
            <EmptyState icon={LineChart} title="Henüz ölçüm kaydedilmedi." compact />
          ) : (
            Array.from(gruplar.entries()).map(([anahtar, grup]) => (
              <div key={anahtar} className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">{grup.baslik}</h4>
                <TrendGrafik noktalar={grup.noktalar} minSkor={grup.min} maksSkor={grup.maks} />
              </div>
            ))
          )}
          {!olcumlerYukleniyor && !romGruplariVarMi && (
            <p className="text-xs text-muted-foreground">
              ROM (eklem hareket açıklığı) ölçüm kaydı henüz girilmedi.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Önce / Sonra Fotoğraflar</CardTitle>
        </CardHeader>
        <CardContent>
          {karsilastirmaYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : (
            <KarsilastirmaGalerisi kayitlar={karsilastirmalar ?? []} />
          )}
        </CardContent>
      </Card>

      <BelgelerMedyaSekmesi hastaId={hastaId} rol={rol} aktif={aktif} />
    </div>
  );
}

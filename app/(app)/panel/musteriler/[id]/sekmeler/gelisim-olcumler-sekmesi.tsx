"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendGrafik } from "@/components/musteri/trend-grafik";
import { HEDEF_DURUM_ETIKETLERI, HEDEF_TIPI_ETIKETLERI } from "@/types/musteri-detay";
import { useMusteriHedefler, useMusteriKarsilastirma, useMusteriOlcumler } from "../queries";
import { KarsilastirmaGalerisi } from "../karsilastirma-galerisi";

export function GelisimOlcumlerSekmesi({
  musteriId,
  sonVasSkoru,
  aktif,
}: {
  musteriId: string;
  sonVasSkoru: number | null;
  aktif: boolean;
}) {
  const { data: olcumler, isLoading: olcumlerYukleniyor } = useMusteriOlcumler(musteriId, aktif);
  const { data: hedefler, isLoading: hedeflerYukleniyor } = useMusteriHedefler(musteriId, aktif);
  const { data: karsilastirmalar, isLoading: karsilastirmaYukleniyor } = useMusteriKarsilastirma(musteriId, aktif);

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
        <CardHeader>
          <CardTitle>VAS / ROM & Ölçek Trendleri</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {olcumlerYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : gruplar.size === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz ölçüm kaydedilmedi.</p>
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
          <CardTitle>Hedeflerle Karşılaştırma</CardTitle>
        </CardHeader>
        <CardContent>
          {hedeflerYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : !hedefler || hedefler.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz hedef yok.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Hedef</th>
                    <th className="pb-2 pr-3 font-medium">Tip</th>
                    <th className="pb-2 pr-3 font-medium">Başlangıç</th>
                    <th className="pb-2 pr-3 font-medium">Hedef</th>
                    <th className="pb-2 pr-3 font-medium">Güncel</th>
                    <th className="pb-2 font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hedefler.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2 pr-3">{h.hedef_metrik}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{HEDEF_TIPI_ETIKETLERI[h.hedef_tipi]}</td>
                      <td className="py-2 pr-3">{h.baslangic_deger ?? "—"}</td>
                      <td className="py-2 pr-3">{h.hedef_deger ?? "—"}</td>
                      <td className="py-2 pr-3">{h.hedef_tipi === "vas" ? (sonVasSkoru ?? "—") : "—"}</td>
                      <td className="py-2">{HEDEF_DURUM_ETIKETLERI[h.durum]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    </div>
  );
}

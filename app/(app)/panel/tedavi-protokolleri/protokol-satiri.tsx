"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { SecenekSatir } from "@/types/randevu";
import type { TedaviProtokoluSatir } from "@/types/tedavi-protokolu";
import { tedaviProtokoluAktifDurumDegistir, tedaviProtokoluGuncelle } from "./actions";
import { ProtokolFormu } from "./protokol-formu";
import type { Adim } from "./adim-editor";

export function ProtokolSatiri({
  protokol,
  tedaviler,
  duzenlenebilir,
}: {
  protokol: TedaviProtokoluSatir;
  tedaviler: SecenekSatir[];
  duzenlenebilir: boolean;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [aktifPending, startAktifTransition] = useTransition();
  const guncelleAction = tedaviProtokoluGuncelle.bind(null, protokol.id);

  const adimlarSirali = [...protokol.tedavi_protokolu_adimi].sort((a, b) => a.sira - b.sira);
  const baslangicAdimlar: Adim[] = adimlarSirali.map((a) => ({
    anahtar: a.id,
    islemTanimiId: a.islem_tanimi?.id ?? "",
    not: a.adim_notu ?? "",
  }));

  if (duzenleniyor) {
    return (
      <li className="py-3">
        <ProtokolFormu
          tedaviler={tedaviler}
          action={guncelleAction}
          gonderButonEtiketi="Kaydet"
          baslangicAd={protokol.ad}
          baslangicAciklama={protokol.aciklama ?? ""}
          baslangicAdimlar={baslangicAdimlar}
          basariliOlunca={() => setDuzenleniyor(false)}
        />
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setDuzenleniyor(false)}>
          Vazgeç
        </Button>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col">
          <span className={`font-medium ${protokol.aktif ? "" : "text-muted-foreground line-through"}`}>
            {protokol.ad}
          </span>
          {protokol.aciklama && <span className="text-muted-foreground">{protokol.aciklama}</span>}
        </div>
        {duzenlenebilir && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={aktifPending}
              onClick={() =>
                startAktifTransition(() => tedaviProtokoluAktifDurumDegistir(protokol.id, !protokol.aktif))
              }
            >
              {protokol.aktif ? "Pasife al" : "Aktifleştir"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setDuzenleniyor(true)}>
              Düzenle
            </Button>
          </div>
        )}
      </div>

      {adimlarSirali.length > 0 && (
        <ol className="flex flex-col gap-1 pl-5 text-muted-foreground">
          {adimlarSirali.map((adim) => (
            <li key={adim.id} className="list-decimal">
              <span className="text-foreground">{adim.islem_tanimi?.ad ?? "(silinmiş tedavi)"}</span>
              {adim.adim_notu && <span> — {adim.adim_notu}</span>}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

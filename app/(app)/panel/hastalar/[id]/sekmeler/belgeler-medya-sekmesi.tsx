"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BELGE_KATEGORI_ETIKETLERI, type BelgeKategori } from "@/types/hasta-belge";
import { VUCUT_BOLGE_ETIKETLERI } from "@/lib/vucut-bolgeleri";
import { useHastaBelgeler } from "../belgeler/queries";
import { YuklemeDialogu } from "../belgeler/yukleme-formu";
import { RadyolojiGrid } from "../belgeler/radyoloji-grid";
import { KlinikFotoGrid } from "../belgeler/klinik-foto-grid";
import { DokumanListe } from "../belgeler/dokuman-liste";

const KATEGORILER: BelgeKategori[] = ["radyoloji", "klinik_foto", "dokuman"];

export function BelgelerMedyaSekmesi({ hastaId, rol, aktif }: { hastaId: string; rol: string | null; aktif: boolean }) {
  const [kategori, setKategori] = useState<BelgeKategori>("radyoloji");
  const [yuklemeAcik, setYuklemeAcik] = useState(false);
  const [bolgeFiltre, setBolgeFiltre] = useState<string>("");

  const { data: belgeler, isLoading } = useHastaBelgeler(hastaId, kategori, aktif);

  const filtrelenmis =
    kategori === "klinik_foto" && bolgeFiltre
      ? (belgeler ?? []).filter((b) => b.bolge === bolgeFiltre)
      : (belgeler ?? []);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {KATEGORILER.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKategori(k)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    kategori === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {BELGE_KATEGORI_ETIKETLERI[k]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {kategori === "klinik_foto" && (
                <select
                  value={bolgeFiltre}
                  onChange={(e) => setBolgeFiltre(e.target.value)}
                  className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none"
                >
                  <option value="">Tüm bölgeler</option>
                  {Object.entries(VUCUT_BOLGE_ETIKETLERI).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              <Button type="button" size="sm" onClick={() => setYuklemeAcik(true)}>
                + Yükle
              </Button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : kategori === "radyoloji" ? (
            <RadyolojiGrid belgeler={filtrelenmis} hastaId={hastaId} rol={rol} onYukle={() => setYuklemeAcik(true)} />
          ) : kategori === "klinik_foto" ? (
            <KlinikFotoGrid belgeler={filtrelenmis} onYukle={() => setYuklemeAcik(true)} />
          ) : (
            <DokumanListe belgeler={filtrelenmis} onYukle={() => setYuklemeAcik(true)} />
          )}
        </CardContent>
      </Card>

      {yuklemeAcik && (
        <YuklemeDialogu hastaId={hastaId} varsayilanKategori={kategori} onKapat={() => setYuklemeAcik(false)} />
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { PersonelSatir } from "@/types/personel";
import { PersonelSatiri } from "./personel-satiri";

export function PersonelListesi({
  personelListesi,
  yonetici,
}: {
  personelListesi: PersonelSatir[];
  yonetici: boolean;
}) {
  const [arama, setArama] = useState("");

  const gruplar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    const filtrelenmis = personelListesi.filter((p) => {
      if (!q) return true;
      return (
        p.ad_soyad.toLocaleLowerCase("tr").includes(q) ||
        p.gorev.toLocaleLowerCase("tr").includes(q) ||
        (p.kullanici?.telefon ?? "").includes(q)
      );
    });

    const map = new Map<string, PersonelSatir[]>();
    for (const p of filtrelenmis) {
      const liste = map.get(p.gorev) ?? [];
      liste.push(p);
      map.set(p.gorev, liste);
    }

    let sira = 0;
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([gorev, liste]) => ({
        gorev,
        liste: liste
          .sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, "tr"))
          .map((personel) => ({ personel, sira: sira++ })),
      }));
  }, [personelListesi, arama]);

  return (
    <div className="flex flex-col gap-5">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="İsim, görev veya telefon ile ara"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          className="h-11 pl-8 focus-visible:ring-ring/50"
        />
      </div>

      {gruplar.length === 0 && (
        <p className="text-sm text-muted-foreground">Aramayla eşleşen personel bulunamadı.</p>
      )}

      {gruplar.map(({ gorev, liste }) => (
        <div key={gorev} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{gorev}</h2>
          <ul className="flex flex-col gap-2">
            {liste.map(({ personel, sira }) => (
              <PersonelSatiri key={personel.id} personel={personel} yonetici={yonetici} gecikme={sira * 40} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

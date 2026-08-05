"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import type { PersonelSatir } from "@/types/personel";

export type PersonelBordroOzet = {
  fazlaMesai: number;
  yolYemek: number;
  sgk: number;
};

const paraFormat = (tutar: number) =>
  tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function PersonelListesi({
  personelListesi,
  yonetici,
  bordroOzet,
}: {
  personelListesi: PersonelSatir[];
  yonetici: boolean;
  /** Seçili ay için personel_id -> fazla mesai/yol-yemek/SGK toplamları. Sadece yönetici görür. */
  bordroOzet?: Record<string, PersonelBordroOzet>;
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

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([gorev, liste]) => ({
        gorev,
        liste: liste.sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, "tr")),
      }));
  }, [personelListesi, arama]);

  function ozetGetir(personelId: string): PersonelBordroOzet {
    return bordroOzet?.[personelId] ?? { fazlaMesai: 0, yolYemek: 0, sgk: 0 };
  }

  function grupToplami(liste: PersonelSatir[]) {
    return liste.reduce(
      (acc, p) => {
        const ozet = ozetGetir(p.id);
        acc.maas += p.maas ?? 0;
        acc.fazlaMesai += ozet.fazlaMesai;
        acc.yolYemek += ozet.yolYemek;
        acc.sgk += ozet.sgk;
        return acc;
      },
      { maas: 0, fazlaMesai: 0, yolYemek: 0, sgk: 0 }
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Input
        type="search"
        placeholder="İsim, görev veya telefon ile ara"
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        className="max-w-sm"
      />

      {gruplar.length === 0 && (
        <p className="text-sm text-muted-foreground">Aramayla eşleşen personel bulunamadı.</p>
      )}

      {gruplar.map(({ gorev, liste }) => {
        const toplam = bordroOzet ? grupToplami(liste) : null;
        const genelToplam = toplam ? toplam.maas + toplam.fazlaMesai + toplam.yolYemek + toplam.sgk : 0;

        return (
          <div key={gorev} className="flex flex-col gap-1">
            <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {gorev}
            </h2>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {liste.map((p) => {
                const ozet = ozetGetir(p.id);
                return (
                  <li key={p.id}>
                    <Link
                      href={`/panel/personel/${p.id}`}
                      className="flex items-center justify-between gap-4 px-3 py-3 text-sm transition-colors hover:bg-card/70"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className={`font-medium ${p.aktif ? "" : "text-muted-foreground line-through"}`}>
                          {p.ad_soyad}
                        </span>
                        <span className="text-muted-foreground">
                          {p.gorev}
                          {yonetici && p.maas != null && ` · Maaş ${paraFormat(p.maas)}`}
                        </span>
                        {bordroOzet && (
                          <span className="text-xs text-muted-foreground">
                            Fazla Mesai {paraFormat(ozet.fazlaMesai)} · Yol/Yemek {paraFormat(ozet.yolYemek)} · SGK{" "}
                            {paraFormat(ozet.sgk)}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-muted-foreground">{p.kullanici?.telefon ?? "—"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {toplam && (
              <p className="px-1 text-xs text-muted-foreground">
                Grup bordro toplamı: Maaş {paraFormat(toplam.maas)} + Fazla Mesai {paraFormat(toplam.fazlaMesai)} +
                Yol/Yemek {paraFormat(toplam.yolYemek)} + SGK {paraFormat(toplam.sgk)} ={" "}
                <span className="font-semibold text-foreground">{paraFormat(genelToplam)}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

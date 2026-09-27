"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { PersonelSatir } from "@/types/personel";
import { PersonelSatiri } from "./personel-satiri";

// Pozisyonu olmayan (eski/kalıntı) personel bu sıra değeriyle listenin sonuna düşer.
const DIGER_SIRA = Number.MAX_SAFE_INTEGER;

export function PersonelListesi({
  personelListesi,
  yonetici,
}: {
  personelListesi: PersonelSatir[];
  yonetici: boolean;
}) {
  const [arama, setArama] = useState("");

  // Ayarlar > Personel Tanımlama'daki pozisyon kataloğuyla AYNI gruplama/sıralama:
  // departman (grup) en küçük pozisyon sırasına göre, departman içinde pozisyonlar
  // kendi sırasına göre — bkz. pozisyonlar-listesi.tsx'teki aynı desen.
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

    const pozisyonMap = new Map<
      string,
      { grup: string; ad: string; sira: number; kisiler: PersonelSatir[] }
    >();
    for (const p of filtrelenmis) {
      const grup = p.pozisyon?.grup ?? "Diğer";
      const ad = p.pozisyon?.ad ?? p.gorev;
      const sira = p.pozisyon?.sira ?? DIGER_SIRA;
      const key = `${grup}::${ad}`;
      const mevcut = pozisyonMap.get(key) ?? { grup, ad, sira, kisiler: [] };
      mevcut.kisiler.push(p);
      pozisyonMap.set(key, mevcut);
    }

    const grupSiralari = new Map<string, number>();
    for (const poz of pozisyonMap.values()) {
      const mevcut = grupSiralari.get(poz.grup);
      if (mevcut === undefined || poz.sira < mevcut) grupSiralari.set(poz.grup, poz.sira);
    }
    const grupAdlari = [...grupSiralari.entries()].sort((a, b) => a[1] - b[1]).map(([grup]) => grup);

    let sira = 0;
    return grupAdlari.map((grup) => ({
      grup,
      pozisyonlar: [...pozisyonMap.values()]
        .filter((poz) => poz.grup === grup)
        .sort((a, b) => a.sira - b.sira)
        .map((poz) => ({
          ad: poz.ad,
          kisiler: poz.kisiler
            .sort((a, b) => a.ad_soyad.localeCompare(b.ad_soyad, "tr"))
            .map((personel) => ({ personel, sira: sira++ })),
        })),
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

      {gruplar.map(({ grup, pozisyonlar }) => (
        <div key={grup} className="flex flex-col gap-3">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{grup}</h2>
          {pozisyonlar.map(({ ad, kisiler }) => (
            <div key={ad} className="flex flex-col gap-2">
              <h3 className="px-1 text-xs font-medium text-muted-foreground/80">{ad}</h3>
              <ul className="flex flex-col gap-2">
                {kisiler.map(({ personel, sira }) => (
                  <PersonelSatiri key={personel.id} personel={personel} yonetici={yonetici} gecikme={sira * 40} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

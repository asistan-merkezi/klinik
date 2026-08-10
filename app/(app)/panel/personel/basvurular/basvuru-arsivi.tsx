"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IsBasvurusu } from "@/types/personel";
import { BasvuruListesi } from "./basvuru-listesi";

/**
 * Kullanıcı kararı: "olumsuz ve beklemede tıklanırsa da arşivde bilgiler
 * dursun (ay, yıl olarak arşiv)" — hiçbir başvuru silinmiyor, olumlu (artık
 * bir Personel kaydına dönüşmüş) dışındaki tüm başvurular burada ay/yıl
 * bazlı gruplu, katlanır bölümlerde tarayılabiliyor (Bekleyen Başvurular
 * listesindekiler burada da görünür — arşiv "geçmişe dönük tarama", ayrı
 * bir durum değil).
 */
export function BasvuruArsivi({ basvurular }: { basvurular: IsBasvurusu[] }) {
  const gruplar = useMemo(() => {
    const map = new Map<string, { etiket: string; liste: IsBasvurusu[] }>();
    for (const b of basvurular) {
      const tarih = new Date(b.created_at);
      const anahtar = `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, "0")}`;
      const etiket = tarih.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
      if (!map.has(anahtar)) map.set(anahtar, { etiket, liste: [] });
      map.get(anahtar)!.liste.push(b);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([anahtar, grup]) => ({ anahtar, ...grup }));
  }, [basvurular]);

  if (gruplar.length === 0) {
    return <p className="text-sm text-muted-foreground">Arşivde henüz başvuru yok.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {gruplar.map((g) => (
        <ArsivGrubu key={g.anahtar} etiket={g.etiket} liste={g.liste} />
      ))}
    </div>
  );
}

function ArsivGrubu({ etiket, liste }: { etiket: string; liste: IsBasvurusu[] }) {
  const [acik, setAcik] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium"
      >
        <span className="capitalize">{etiket}</span>
        <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          {liste.length} başvuru
          <ChevronDown className={cn("size-4 transition-transform", acik && "rotate-180")} />
        </span>
      </button>
      {acik && (
        <div className="border-t border-border px-3">
          <BasvuruListesi basvurular={liste} />
        </div>
      )}
    </div>
  );
}

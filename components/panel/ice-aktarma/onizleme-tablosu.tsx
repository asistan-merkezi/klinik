import { cn } from "@/lib/utils";

export type Kolon<T> = { baslik: string; render: (satir: T) => React.ReactNode; className?: string };

// Projede paylaşılan bir tablo bileşeni yoktu — bu ilki, 3 arşiv sihirbazı
// arasında (eşlenmiş satır önizlemesi + import sonucu raporu için) paylaşılıyor.
export function OnizlemeTablosu<T>({
  satirlar,
  kolonlar,
  bosMesaj = "Gösterilecek satır yok.",
}: {
  satirlar: T[];
  kolonlar: Kolon<T>[];
  bosMesaj?: string;
}) {
  if (satirlar.length === 0) {
    return <p className="text-sm text-muted-foreground">{bosMesaj}</p>;
  }

  return (
    <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="sticky top-0 bg-surface-2 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">#</th>
            {kolonlar.map((kolon) => (
              <th key={kolon.baslik} className="px-3 py-2 font-medium whitespace-nowrap">
                {kolon.baslik}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {satirlar.map((satir, i) => (
            <tr key={i} className="odd:bg-transparent even:bg-surface-2/50">
              <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
              {kolonlar.map((kolon) => (
                <td key={kolon.baslik} className={cn("px-3 py-1.5", kolon.className)}>
                  {kolon.render(satir)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type ArsivSonucSatiri = {
  satir_no: number;
  durum: "eklendi" | "atlandi" | "hata";
  sebep?: string;
};

// RPC'lerin döndürdüğü {satir_no, durum, sebep?} dizisini özet rozetler +
// (varsa) atlanan/hatalı satırların dökümü olarak gösterir.
export function SonucRaporu({ sonuclar }: { sonuclar: ArsivSonucSatiri[] }) {
  const eklendi = sonuclar.filter((s) => s.durum === "eklendi").length;
  const atlandi = sonuclar.filter((s) => s.durum === "atlandi").length;
  const hata = sonuclar.filter((s) => s.durum === "hata").length;
  const sorunlular = sonuclar.filter((s) => s.durum !== "eklendi");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-medium text-emerald-600 dark:text-emerald-400">
          {eklendi} eklendi
        </span>
        {atlandi > 0 && (
          <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">{atlandi} atlandı</span>
        )}
        {hata > 0 && (
          <span className="rounded-full bg-destructive/10 px-3 py-1 font-medium text-destructive">{hata} hata</span>
        )}
      </div>
      {sorunlular.length > 0 && (
        <OnizlemeTablosu
          satirlar={sorunlular}
          kolonlar={[
            { baslik: "Satır", render: (s) => s.satir_no },
            { baslik: "Durum", render: (s) => (s.durum === "atlandi" ? "Atlandı" : "Hata") },
            { baslik: "Sebep", render: (s) => s.sebep ?? "—", className: "text-muted-foreground" },
          ]}
        />
      )}
    </div>
  );
}

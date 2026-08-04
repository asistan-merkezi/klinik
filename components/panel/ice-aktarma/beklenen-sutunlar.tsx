import type { HedefAlan } from "./sutun-esleme";

// Dosyanızdaki sütun adları bunlarla BİREBİR aynıysa Sütun Eşleştirme adımı
// otomatik dolar; farklıysa sorun değil, o adımda elle seçebilirsiniz.
export function BeklenenSutunlar({ hedefAlanlar }: { hedefAlanlar: HedefAlan[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <p className="mb-2 text-sm font-medium">Beklenen Sütun Başlıkları</p>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {hedefAlanlar.map((alan) => (
          <li key={alan.key}>
            <span className="font-mono text-foreground">{alan.label}</span>
            {alan.zorunlu ? <span className="text-destructive"> (zorunlu)</span> : " (opsiyonel)"}
          </li>
        ))}
      </ul>
    </div>
  );
}

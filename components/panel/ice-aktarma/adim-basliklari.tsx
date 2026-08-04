// personel-formu.tsx'teki adım rozeti deseninin (tamamlanan yeşil / aktif
// primary / kalan muted) 3 sihirbaz arasında paylaşılan genel hali.
export function AdimBasliklari({ basliklar, aktifAdim }: { basliklar: string[]; aktifAdim: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {basliklar.map((baslik, i) => {
        const n = i + 1;
        return (
          <span
            key={baslik}
            className={`rounded-full px-2.5 py-1 font-medium ${
              n === aktifAdim
                ? "bg-primary text-primary-foreground"
                : n < aktifAdim
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {n}. {baslik}
          </span>
        );
      })}
    </div>
  );
}

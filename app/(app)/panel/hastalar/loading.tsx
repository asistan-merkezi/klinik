export default function HastalarYukleniyor() {
  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24 sm:max-w-3xl sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="h-7 w-32 animate-pulse rounded bg-card" />
            <div className="h-4 w-64 animate-pulse rounded bg-card" />
          </div>
        </header>

        <div className="h-10 w-full animate-pulse rounded-lg bg-card" />

        <ul className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="h-16 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </ul>
      </div>
    </div>
  );
}

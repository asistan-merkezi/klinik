export default function PersonelTakipYukleniyor() {
  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <div className="h-6 w-40 animate-pulse rounded bg-card" />
          <div className="h-4 w-80 animate-pulse rounded bg-card" />
        </header>

        <div className="rounded-xl border border-border">
          <div className="border-b border-border p-4">
            <div className="h-5 w-48 animate-pulse rounded bg-card" />
          </div>
          <div className="flex flex-col divide-y divide-border p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="h-4 w-40 animate-pulse rounded bg-card" />
                <div className="h-4 w-24 animate-pulse rounded bg-card" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

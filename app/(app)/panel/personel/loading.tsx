export default function PersonelYukleniyor() {
  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="h-10 w-72 animate-pulse rounded-xl bg-card" />

        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="h-6 w-48 animate-pulse rounded bg-card" />
            <div className="h-4 w-72 animate-pulse rounded bg-card" />
          </div>
        </header>

        <div className="rounded-xl border border-border">
          <div className="border-b border-border p-4">
            <div className="h-5 w-40 animate-pulse rounded bg-card" />
          </div>
          <div className="flex flex-col divide-y divide-border p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-1.5">
                  <div className="h-4 w-32 animate-pulse rounded bg-card" />
                  <div className="h-3 w-48 animate-pulse rounded bg-card" />
                </div>
                <div className="h-4 w-24 animate-pulse rounded bg-card" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

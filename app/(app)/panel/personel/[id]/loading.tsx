export default function PersonelDetayYukleniyor() {
  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="h-8 w-40 animate-pulse rounded bg-card" />

        <div className="rounded-xl border border-border p-4">
          <div className="h-5 w-56 animate-pulse rounded bg-card" />
          <div className="mt-2 h-4 w-40 animate-pulse rounded bg-card" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      </div>
    </div>
  );
}

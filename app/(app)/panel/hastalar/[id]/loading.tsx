export default function HastaDetayYukleniyor() {
  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-24 sm:max-w-4xl sm:p-8">
        <div className="flex justify-end">
          <div className="h-9 w-32 animate-pulse rounded-lg bg-card" />
        </div>

        <div className="h-20 animate-pulse rounded-xl border border-border bg-card" />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>

        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    </div>
  );
}

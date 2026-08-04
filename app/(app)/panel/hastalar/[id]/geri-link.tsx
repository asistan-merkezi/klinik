import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function GeriLink({ hastaId, baslik }: { hastaId: string; baslik: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Link
        href={`/panel/hastalar/${hastaId}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Hasta özetine dön
      </Link>
      <h2 className="text-base font-semibold">{baslik}</h2>
    </div>
  );
}

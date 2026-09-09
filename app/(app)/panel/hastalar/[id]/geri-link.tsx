import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

/** 4 alt rota sayfasının (kişisel/randevu/tedavi/cari) hepsi bunu kullanıyor — tek yerden PageHeader'a geçiş. */
export function GeriLink({ hastaId, baslik }: { hastaId: string; baslik: string }) {
  return (
    <PageHeader
      title={baslik}
      breadcrumb={
        <Link
          href={`/panel/hastalar/${hastaId}`}
          className="flex w-fit items-center gap-1 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Hasta özetine dön
        </Link>
      }
    />
  );
}

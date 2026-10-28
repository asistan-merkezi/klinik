import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/datetime";
import { destekBaglamiKapat } from "@/app/(app)/panel/yonetim/destek-baglami/actions";

/** super_admin destek bağlamındayken her sayfanın üstünde görünen şerit: hangi klinik, ne zamana kadar; tek tıkla kapatma. */
export function DestekBandi({ klinikAdi, bitis }: { klinikAdi: string; bitis: Date }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 border-b border-border bg-amber-500/15 px-4 py-2 text-sm">
      <LifeBuoy className="size-4 shrink-0" aria-hidden />
      <span>
        Destek bağlamı: <span className="font-medium">{klinikAdi}</span> — bitiş <span className="font-medium tabular">{formatTime(bitis.toISOString())}</span>
      </span>
      <form action={destekBaglamiKapat} className="ml-auto">
        <Button type="submit" size="sm" variant="outline">
          Kapat
        </Button>
      </form>
    </div>
  );
}

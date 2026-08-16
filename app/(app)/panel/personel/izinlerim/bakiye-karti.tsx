import { Card, CardContent } from "@/components/ui/card";
import type { IzinBakiye } from "@/types/izin";

export function BakiyeKarti({ bakiye }: { bakiye: IzinBakiye }) {
  const negatif = bakiye.kalan_gun < 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Yıllık İzin Bakiyesi</span>
        <span className={negatif ? "text-2xl font-semibold text-rose-600 dark:text-rose-400" : "text-2xl font-semibold"}>
          Kalan {bakiye.kalan_gun} gün
          {bakiye.beklemede_gun > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">· {bakiye.beklemede_gun} gün onayda</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          Hak: {bakiye.hak_gun} gün{bakiye.devir_gun !== 0 && ` · Devir: ${bakiye.devir_gun} gün`}
          {bakiye.duzeltme_gun !== 0 && ` · Düzeltme: ${bakiye.duzeltme_gun} gün`} · Kullanılan: {bakiye.onaylanan_gun} gün
        </span>
      </CardContent>
    </Card>
  );
}

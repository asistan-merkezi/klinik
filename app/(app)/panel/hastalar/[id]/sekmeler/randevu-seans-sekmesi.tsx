import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import { PeriyodikRandevularKarti } from "../periyodik-randevular-karti";

export function RandevuSeansSekmesi({
  hastaId,
  duzenlenebilir,
  periyodikRandevular,
}: {
  hastaId: string;
  duzenlenebilir: boolean;
  periyodikRandevular: PeriyodikRandevuSatir[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {duzenlenebilir && (
        <Card>
          <CardHeader>
            <CardTitle>Periyodik Randevular</CardTitle>
          </CardHeader>
          <CardContent>
            <PeriyodikRandevularKarti hastaId={hastaId} periyodikRandevular={periyodikRandevular} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
          <p className="text-sm font-medium">Randevu Listesi</p>
          <p className="text-sm text-muted-foreground">
            Gelecek/geçmiş randevular, hızlı randevu oluşturma ve no-show geçmişi yakında eklenecek.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

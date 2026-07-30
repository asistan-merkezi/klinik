import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import type { SecenekSatir } from "@/types/randevu";
import { PeriyodikRandevularKarti } from "../periyodik-randevular-karti";
import { YeniRandevuDialog } from "../../../randevular/yeni-randevu-dialog";
import { PeriyodikRandevuDialog } from "../../../randevular/periyodik-randevu-dialog";

export function RandevuSeansSekmesi({
  hastaId,
  hastaAdSoyad,
  duzenlenebilir,
  periyodikRandevular,
  terapistler,
  odalar,
  cihazlar,
  tedaviler,
}: {
  hastaId: string;
  hastaAdSoyad: string;
  duzenlenebilir: boolean;
  periyodikRandevular: PeriyodikRandevuSatir[];
  terapistler: SecenekSatir[];
  odalar: SecenekSatir[];
  cihazlar: SecenekSatir[];
  tedaviler: SecenekSatir[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {duzenlenebilir && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Periyodik Randevular</CardTitle>
            <PeriyodikRandevuDialog
              sabitHasta={{ id: hastaId, ad: hastaAdSoyad }}
              hastalar={[]}
              terapistler={terapistler}
              odalar={odalar}
              cihazlar={cihazlar}
              tedaviler={tedaviler}
            />
          </CardHeader>
          <CardContent>
            <PeriyodikRandevularKarti hastaId={hastaId} periyodikRandevular={periyodikRandevular} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Randevu Listesi</CardTitle>
          <YeniRandevuDialog
            buttonLabel="Randevu Ekle"
            sabitHasta={{ id: hastaId, ad: hastaAdSoyad }}
            hastalar={[]}
            terapistler={terapistler}
            odalar={odalar}
            cihazlar={cihazlar}
            tedaviler={tedaviler}
          />
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-1 py-10 text-center">
          <p className="text-sm font-medium">Randevu Listesi</p>
          <p className="text-sm text-muted-foreground">
            Gelecek/geçmiş randevular ve no-show geçmişi yakında eklenecek.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

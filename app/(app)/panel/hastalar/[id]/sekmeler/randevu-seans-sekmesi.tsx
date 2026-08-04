import { CalendarX2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/datetime";
import { RANDEVU_DURUM_ETIKETLERI, RANDEVU_DURUM_TONLARI } from "@/types/hasta-detay";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import { PeriyodikRandevularKarti } from "../periyodik-randevular-karti";
import { YeniRandevuDialog } from "../../../randevular/yeni-randevu-dialog";
import { PeriyodikRandevuDialog } from "../../../randevular/periyodik-randevu-dialog";

export function RandevuSeansSekmesi({
  hastaId,
  hastaAdSoyad,
  duzenlenebilir,
  periyodikRandevular,
  randevuListesi,
  terapistler,
  odalar,
  cihazlar,
  tedaviler,
}: {
  hastaId: string;
  hastaAdSoyad: string;
  duzenlenebilir: boolean;
  periyodikRandevular: PeriyodikRandevuSatir[];
  randevuListesi: RandevuSatir[];
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
        <CardContent>
          {randevuListesi.length === 0 ? (
            <EmptyState icon={CalendarX2} title="Henüz randevu yok." />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {randevuListesi.map((randevu) => {
                const etiket =
                  randevu.durum === "gecikmeli_geldi" && randevu.gecikme_dakika
                    ? `${RANDEVU_DURUM_ETIKETLERI[randevu.durum]} (${randevu.gecikme_dakika} dk)`
                    : RANDEVU_DURUM_ETIKETLERI[randevu.durum];

                return (
                  <li key={randevu.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{formatDateTime(randevu.baslangic)}</span>
                      <span className="text-xs text-muted-foreground">
                        {randevu.islem_tanimi?.ad ?? "—"} · {randevu.terapist?.personel?.ad_soyad ?? "Terapist atanmamış"}
                        {randevu.oda?.ad ? ` · ${randevu.oda.ad}` : ""}
                        {randevu.kaynak === "arsiv" ? " · Arşiv kaydı" : ""}
                      </span>
                    </div>
                    <StatusBadge tone={RANDEVU_DURUM_TONLARI[randevu.durum]}>{etiket}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

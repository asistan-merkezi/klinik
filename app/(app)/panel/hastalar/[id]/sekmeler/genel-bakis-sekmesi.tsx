"use client";

import { CalendarClock, Target, LineChart, FileStack, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { IconTile, type IconTileTone } from "@/components/ui/icon-tile";
import { RANDEVU_DURUM_ETIKETLERI, RANDEVU_DURUM_TONLARI } from "@/types/hasta-detay";
import { useHastaDetayOzet, useHastaSonSeans, useHastaAktifHedefSayisi } from "../queries";
import { CLINIC_TZ } from "@/lib/datetime";

const TARIH_SAAT_FORMAT = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CLINIC_TZ,
});

const TARIH_FORMAT = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" });

function IstatistikKarti({
  icon: Icon,
  tone,
  etiket,
  deger,
  yukleniyor,
}: {
  icon: React.ComponentProps<typeof IconTile>["icon"];
  tone: IconTileTone;
  etiket: string;
  deger: string;
  yukleniyor: boolean;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <IconTile icon={Icon} tone={tone} />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{etiket}</span>
          <span className="text-lg font-semibold tabular-nums">{yukleniyor ? "—" : deger}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function GenelBakisSekmesi({ hastaId, kayitTarihi, aktif }: { hastaId: string; kayitTarihi: string; aktif: boolean }) {
  const { data: detayOzet, isLoading: ozetYukleniyor } = useHastaDetayOzet(hastaId);
  const { data: sonSeans, isLoading: sonSeansYukleniyor } = useHastaSonSeans(hastaId, aktif);
  const { data: aktifHedefSayisi, isLoading: hedefYukleniyor } = useHastaAktifHedefSayisi(hastaId, aktif);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <IstatistikKarti
          icon={CalendarClock}
          tone="blue"
          etiket="Kayıt Tarihi"
          deger={TARIH_FORMAT.format(new Date(kayitTarihi))}
          yukleniyor={false}
        />
        <IstatistikKarti
          icon={Target}
          tone="emerald"
          etiket="Aktif Hedef"
          deger={String(aktifHedefSayisi ?? 0)}
          yukleniyor={hedefYukleniyor}
        />
        <IstatistikKarti
          icon={LineChart}
          tone="violet"
          etiket="Ölçüm"
          deger={String(detayOzet?.olcum_sayisi ?? 0)}
          yukleniyor={ozetYukleniyor}
        />
        <IstatistikKarti
          icon={FileStack}
          tone="amber"
          etiket="Belge"
          deger={String(detayOzet?.belge_sayisi ?? 0)}
          yukleniyor={ozetYukleniyor}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Son Seans</CardTitle>
        </CardHeader>
        <CardContent>
          {sonSeansYukleniyor ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : !sonSeans ? (
            <EmptyState icon={History} title="Henüz geçmiş seans yok." compact />
          ) : (
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{TARIH_SAAT_FORMAT.format(new Date(sonSeans.baslangic))}</span>
                <StatusBadge tone={RANDEVU_DURUM_TONLARI[sonSeans.durum]}>
                  {RANDEVU_DURUM_ETIKETLERI[sonSeans.durum]}
                </StatusBadge>
              </div>
              <p className="text-muted-foreground">
                {sonSeans.islem_tanimi?.ad ?? "—"} · {sonSeans.terapist?.personel?.ad_soyad ?? "Terapist atanmamış"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

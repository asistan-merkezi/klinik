import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Bell } from "lucide-react";
import { BekleyenIptalTalepleri } from "../../randevular/bekleyen-iptal-talepleri";
import { BekleyenRandevuTalepleri } from "../../randevular/bekleyen-randevu-talepleri";
import { AnketYanitiListesi, SeansDegerlendirmeListesi } from "./geri-bildirim-listesi";
import { GoruluIsaretleyici } from "./goruldu-isaretleyici";
import type { BildirimVerileri } from "./bildirim-verileri";

/**
 * Hastalar > Bildirimler sayfası ile Ana Ekran'ın paylaştığı kart listesi.
 * bosKenGoster=false ise (Ana Ekran) hiçbir kategori doluyken boş durum hiç
 * render edilmez — sayfa bildirim yokken sessizce hiçbir şey göstermez.
 */
export function BildirimListesi({
  veri,
  bosKenGoster = true,
}: {
  veri: BildirimVerileri;
  bosKenGoster?: boolean;
}) {
  const {
    bekleyenIptalTalepleri,
    bekleyenRandevuTalepleri,
    anketYanitlari,
    seansDegerlendirmeleri,
    hastalar,
    terapistler,
    odalar,
    cihazlar,
    tedaviler,
  } = veri;

  const hicBirSeyYok =
    bekleyenIptalTalepleri.length === 0 &&
    bekleyenRandevuTalepleri.length === 0 &&
    anketYanitlari.length === 0 &&
    seansDegerlendirmeleri.length === 0;

  if (hicBirSeyYok && !bosKenGoster) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {hicBirSeyYok && <EmptyState icon={Bell} title="Henüz bildirim yok." />}

      {bekleyenRandevuTalepleri.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bekleyen Randevu Talepleri</CardTitle>
          </CardHeader>
          <CardContent>
            <BekleyenRandevuTalepleri
              talepler={bekleyenRandevuTalepleri}
              hastalar={hastalar}
              terapistler={terapistler}
              odalar={odalar}
              cihazlar={cihazlar}
              tedaviler={tedaviler}
            />
          </CardContent>
        </Card>
      )}

      {bekleyenIptalTalepleri.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bekleyen İptal Talepleri</CardTitle>
          </CardHeader>
          <CardContent>
            <BekleyenIptalTalepleri talepler={bekleyenIptalTalepleri} />
          </CardContent>
        </Card>
      )}

      {seansDegerlendirmeleri.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Seans Değerlendirmeleri</CardTitle>
          </CardHeader>
          <CardContent>
            <SeansDegerlendirmeListesi degerlendirmeler={seansDegerlendirmeleri} />
          </CardContent>
        </Card>
      )}

      {anketYanitlari.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Anket ve Öneriler</CardTitle>
          </CardHeader>
          <CardContent>
            <AnketYanitiListesi yanitlar={anketYanitlari} />
          </CardContent>
        </Card>
      )}

      <GoruluIsaretleyici
        anketIdleri={anketYanitlari.map((a) => a.id)}
        seansIdleri={seansDegerlendirmeleri.map((s) => s.id)}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { anketYanitlariGetir, seansDegerlendirmeleriGetir } from "@/lib/hasta/bildirim-sorgular";
import { bekleyenIptalTalepleriGetir, bekleyenRandevuTalepleriGetir, cihazSecenekleriGetir, odaSecenekleriGetir } from "@/lib/randevu/sorgular";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Bell } from "lucide-react";
import { BekleyenIptalTalepleri } from "../../randevular/bekleyen-iptal-talepleri";
import { BekleyenRandevuTalepleri } from "../../randevular/bekleyen-randevu-talepleri";
import { AnketYanitiListesi, SeansDegerlendirmeListesi } from "./geri-bildirim-listesi";
import { GoruluIsaretleyici } from "./goruldu-isaretleyici";
import { atanabilirTerapistleriGetir } from "@/lib/personel/atanabilir-terapistler";
import { tedaviSecenekleriGetir } from "@/lib/randevu/tedavi-secenekleri";

export default async function HastaBildirimleriSayfasi() {
  const { ctx, bag } = await panelBaglami();

  if (ctx.rol !== "klinik_admin" && ctx.rol !== "resepsiyon") {
    redirect("/panel/hastalar");
  }

  const v = await withTenant(bag, async (tx) => ({
    bekleyenIptalTalepleri: await bekleyenIptalTalepleriGetir(tx),
    bekleyenRandevuTalepleri: await bekleyenRandevuTalepleriGetir(tx),
    anketYanitlari: await anketYanitlariGetir(tx, 50),
    seansDegerlendirmeleri: await seansDegerlendirmeleriGetir(tx, 50),
    terapistler: await atanabilirTerapistleriGetir(tx),
    odalar: await odaSecenekleriGetir(tx),
    cihazlar: await cihazSecenekleriGetir(tx),
    tedaviler: await tedaviSecenekleriGetir(tx),
  }));
  const { bekleyenIptalTalepleri, bekleyenRandevuTalepleri, anketYanitlari, seansDegerlendirmeleri, terapistler, odalar, cihazlar, tedaviler } = v;

  const hicBirSeyYok =
    bekleyenIptalTalepleri.length === 0 &&
    bekleyenRandevuTalepleri.length === 0 &&
    anketYanitlari.length === 0 &&
    seansDegerlendirmeleri.length === 0;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Bildirimler</h1>
          <p className="text-sm text-muted-foreground">
            Hastaların portaldan gönderdiği randevu talep/iptal talepleri, seans sonu değerlendirmeleri ve Anket ve
            Öneriler yanıtları.
          </p>
        </header>

        {hicBirSeyYok && <EmptyState icon={Bell} title="Henüz bildirim yok." />}

        {bekleyenRandevuTalepleri.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Bekleyen Randevu Talepleri</CardTitle>
            </CardHeader>
            <CardContent>
              <BekleyenRandevuTalepleri
                talepler={bekleyenRandevuTalepleri}
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
      </div>

      <GoruluIsaretleyici
        anketIdleri={anketYanitlari.map((a) => a.id)}
        seansIdleri={seansDegerlendirmeleri.map((s) => s.id)}
      />
    </div>
  );
}

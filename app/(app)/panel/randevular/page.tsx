import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { gunAraligi } from "@/lib/utils";
import { CanliCizelge } from "@/components/panel/canli-cizelge";
import { YeniRandevuDialog } from "./yeni-randevu-dialog";
import { BekleyenIptalTalepleri } from "./bekleyen-iptal-talepleri";
import { BekleyenRandevuTalepleri } from "./bekleyen-randevu-talepleri";
import { withTenant } from "@/lib/db";
import { panelBaglami } from "@/lib/auth/yetki";
import { atanabilirTerapistleriGetir } from "@/lib/personel/atanabilir-terapistler";
import { tedaviSecenekleriGetir } from "@/lib/randevu/tedavi-secenekleri";
import {
  antrenorSecenekleriGetir,
  bankaHesaplariGetir,
  bekleyenIptalTalepleriGetir,
  bekleyenRandevuTalepleriGetir,
  cihazSecenekleriGetir,
  kendiTerapistIdGetir,
  odaSecenekleriGetir,
  protokolSecenekleriGetir,
  randevuSatirlariGetir,
} from "@/lib/randevu/sorgular";

export default async function RandevularSayfasi() {
  const { ctx, bag } = await panelBaglami();
  const rol = ctx.rol;
  const { baslangic, bitis } = gunAraligi();

  let veri;
  try {
    veri = await withTenant(bag, async (tx) => ({
      kendiTerapistId: rol === "terapist" ? await kendiTerapistIdGetir(tx, ctx.userId) : null,
      randevular: await randevuSatirlariGetir(tx, { baslangic, bitis }),
      terapistler: await atanabilirTerapistleriGetir(tx),
      odalar: await odaSecenekleriGetir(tx),
      cihazlar: await cihazSecenekleriGetir(tx),
      tedaviler: await tedaviSecenekleriGetir(tx),
      antrenorler: await antrenorSecenekleriGetir(tx),
      protokoller: await protokolSecenekleriGetir(tx),
      bekleyenIptalTalepleri: await bekleyenIptalTalepleriGetir(tx),
      bekleyenRandevuTalepleri: await bekleyenRandevuTalepleriGetir(tx),
      bankaHesaplari: await bankaHesaplariGetir(tx),
    }));
  } catch (hata) {
    console.error("Randevular sayfası verisi çekilemedi:", hata);
    veri = null;
  }
  const { kendiTerapistId, randevular, terapistler, odalar, cihazlar, tedaviler, antrenorler, protokoller, bekleyenIptalTalepleri, bekleyenRandevuTalepleri, bankaHesaplari } =
    veri ?? {
      kendiTerapistId: null,
      randevular: [],
      terapistler: [],
      odalar: [],
      cihazlar: [],
      tedaviler: [],
      antrenorler: [],
      protokoller: [],
      bekleyenIptalTalepleri: [],
      bekleyenRandevuTalepleri: [],
      bankaHesaplari: [],
    };

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Randevular</h1>
            <p className="text-sm text-muted-foreground">
              Çizelgede tarih gezinerek geçmiş/gelecek randevuları görüntüle, yeni randevu oluştur.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <YeniRandevuDialog
              terapistler={terapistler}
              odalar={odalar}
              cihazlar={cihazlar}
              tedaviler={tedaviler}
            />
          </div>
        </header>

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

        {!veri ? (
          <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
        ) : (
          <CanliCizelge
            baslangicRandevular={randevular}
            odalar={odalar}
            terapistler={terapistler}
            cihazlar={cihazlar}
            tedaviler={tedaviler}
            antrenorler={antrenorler}
            protokoller={protokoller}
            bankaHesaplari={bankaHesaplari}
            tarihNavigasyonuGoster
            rol={rol}
            kendiTerapistId={kendiTerapistId}
          />
        )}
      </div>
    </div>
  );
}

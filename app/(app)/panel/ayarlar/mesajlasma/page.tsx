import Link from "next/link";
import { MessageSquareText, MessageCircle, Mail } from "lucide-react";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { sayfaYetkisiIste } from "@/lib/auth/sayfa-yetkisi";
import { panelBaglami } from "@/lib/auth/yetki";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { BOLUM_SIRASI, KANAL_SIRASI, KANAL_ETIKET, type MesajBolum, type EtkinMesajKurali } from "@/types/mesajlasma";
import { etkinKurallariOlustur, type MesajKuraliDbSatiri } from "@/lib/mesaj/kural-cozumle";
import { sessizSaatAyariCoz } from "@/lib/mesaj/sessiz-saat";
import { BolumKartGrubu } from "./bolum-kart-grubu";
import { SessizSaatKarti } from "./sessiz-saat-karti";

const KANAL_IKON = {
  sms: MessageSquareText,
  whatsapp: MessageCircle,
  mail: Mail,
} as const;

export default async function MesajlasmaSayfasi() {
  const { kullanici } = await sayfaYetkisiIste(["klinik_admin"], { yetkisizHedef: "/panel/ayarlar" });
  const klinikId = kullanici.klinik_id;
  if (!klinikId) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <p className="text-sm text-muted-foreground">Klinik bilgisi bulunamadı.</p>
      </div>
    );
  }

  const { bag } = await panelBaglami();
  const [kurallar, bakiyeler, ayarSatiri] = await withTenant(bag, (tx) =>
    Promise.all([
      tx
        .select({ id: sema.mesajKurallari.id, tetikleyici_kodu: sema.mesajKurallari.tetikleyiciKodu, aktif: sema.mesajKurallari.aktif, sms_aktif: sema.mesajKurallari.smsAktif, whatsapp_aktif: sema.mesajKurallari.whatsappAktif, mail_aktif: sema.mesajKurallari.mailAktif, mesaj_metni: sema.mesajKurallari.mesajMetni })
        .from(sema.mesajKurallari)
        .where(eq(sema.mesajKurallari.klinikId, klinikId)),
      tx.select({ kanal: sema.mesajKredileri.kanal, bakiye: sema.mesajKredileri.bakiye }).from(sema.mesajKredileri).where(eq(sema.mesajKredileri.klinikId, klinikId)),
      tx.select({ ayarlar: sema.klinikAyarlar.ayarlar }).from(sema.klinikAyarlar).where(eq(sema.klinikAyarlar.klinikId, klinikId)).limit(1),
    ])
  );

  const sessizSaat = sessizSaatAyariCoz((ayarSatiri[0]?.ayarlar as Record<string, unknown> | null)?.mesaj_sessiz_saat);

  const etkinKurallar = etkinKurallariOlustur(kurallar as MesajKuraliDbSatiri[]);
  const bakiyeMap = new Map(bakiyeler.map((b) => [b.kanal, b.bakiye]));

  const bolumGruplari = new Map<MesajBolum, EtkinMesajKurali[]>();
  for (const bolum of BOLUM_SIRASI) bolumGruplari.set(bolum, []);
  for (const kural of etkinKurallar) bolumGruplari.get(kural.bolum)?.push(kural);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={MessageCircle}
          title="SMS/Whatsapp/Mail Ayarları"
          description="Klinikte tetiklenen olaylarda (hasta, randevu, personel, muhasebe) hangi kanaldan bildirim gönderileceğini buradan yapılandırın. Gönderim kredi bazlı çalışır — kredi biterse ilgili kanaldan gönderim yapılmaz."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {KANAL_SIRASI.map((kanal) => {
            const Icon = KANAL_IKON[kanal];
            const bakiye = bakiyeMap.get(kanal) ?? 0;
            return (
              <Card key={kanal}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" aria-hidden />
                    <span className="text-sm font-medium">{KANAL_ETIKET[kanal]}</span>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums">{bakiye}</p>
                    <p className="text-xs text-muted-foreground">kalan kredi</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<Link href={`/panel/ayarlar/mesajlasma/kredi/${kanal}`}>Kredi Detayı</Link>}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>

        <SessizSaatKarti
          baslangicAktif={sessizSaat !== null}
          baslangicSaati={sessizSaat?.baslangic ?? "21:00"}
          bitisSaati={sessizSaat?.bitis ?? "08:00"}
        />

        <div className="flex flex-col gap-6">
          {BOLUM_SIRASI.map((bolum) => (
            <BolumKartGrubu key={bolum} bolum={bolum} kurallar={bolumGruplari.get(bolum) ?? []} />
          ))}
        </div>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageSquareText, MessageCircle, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BOLUM_SIRASI,
  KANAL_SIRASI,
  KANAL_ETIKET,
  type MesajBolum,
  type MesajKuralSatir,
  type MesajKrediBakiyeSatir,
} from "@/types/mesajlasma";
import { BolumAccordion } from "./bolum-accordion";

const KANAL_IKON = {
  sms: MessageSquareText,
  whatsapp: MessageCircle,
  mail: Mail,
} as const;

export default async function MesajlasmaSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar");
  }

  const klinikId = kullanici.klinik_id;
  if (!klinikId) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <p className="text-sm text-muted-foreground">Klinik bilgisi bulunamadı.</p>
      </div>
    );
  }

  const [kurallarSonuc, bakiyelerSonuc] = await Promise.all([
    supabase
      .from("mesaj_kural")
      .select("id, bolum, tetikleyici_kod, tetikleyici_adi, sms_aktif, whatsapp_aktif, mail_aktif, aktif")
      .eq("klinik_id", klinikId)
      .order("bolum")
      .order("tetikleyici_kod")
      .returns<MesajKuralSatir[]>(),
    supabase
      .from("mesaj_kredi_bakiye")
      .select("kanal, bakiye, updated_at")
      .eq("klinik_id", klinikId)
      .returns<MesajKrediBakiyeSatir[]>(),
  ]);

  const kurallar = kurallarSonuc.data ?? [];
  const bakiyeMap = new Map(bakiyelerSonuc.data?.map((b) => [b.kanal, b.bakiye]) ?? []);

  const bolumGruplari = new Map<MesajBolum, MesajKuralSatir[]>();
  for (const bolum of BOLUM_SIRASI) bolumGruplari.set(bolum, []);
  for (const kural of kurallar) bolumGruplari.get(kural.bolum)?.push(kural);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Mesajlaşma</h1>
          <p className="text-sm text-muted-foreground">
            Klinikte tetiklenen olaylarda (hasta, randevu, personel, muhasebe) hangi kanaldan bildirim
            gönderileceğini buradan yapılandırın. Gönderim kredi bazlı çalışır — kredi biterse ilgili
            kanaldan gönderim yapılmaz.
          </p>
        </header>

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
                    render={<Link href={`/panel/ayarlar/mesajlasma/kredi/${kanal}`}>Kredi Yükle</Link>}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          {BOLUM_SIRASI.map((bolum, i) => (
            <BolumAccordion key={bolum} bolum={bolum} kurallar={bolumGruplari.get(bolum) ?? []} varsayilanAcik={i === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}

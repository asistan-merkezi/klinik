import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HastaDetay } from "@/types/hasta";
import type { HastaHassasSatir } from "@/types/hasta-hassas";
import { BilgilerFormu } from "./bilgiler-formu";

export default async function PortalBilgilerimSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/giris");
  }

  const { data: mk } = await supabase
    .from("hasta_kullanici")
    .select("hasta_id, aktif")
    .eq("id", user.id)
    .single();

  if (!mk?.hasta_id || !mk.aktif) {
    redirect("/portal/giris");
  }

  const hastaId = mk.hasta_id;

  const [hastaSonucu, hassasSonucu] = await Promise.all([
    supabase
      .from("hasta")
      .select(
        "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, cinsiyet, eposta, referans_kanali, ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi"
      )
      .eq("id", hastaId)
      .single<HastaDetay>(),
    supabase.from("hasta_hassas").select("*").eq("hasta_id", hastaId).maybeSingle<HastaHassasSatir>(),
  ]);

  const hasta = hastaSonucu.data;
  const hassas = hassasSonucu.data;

  if (!hasta) {
    redirect("/portal");
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Detaylı Bilgilerim</h1>
            <p className="text-sm text-muted-foreground">
              Adres, acil durum kişisi ve sağlık geçmişinizi güncelleyin.
            </p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/portal">Portala dön</Link>} />
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Bilgilerim</CardTitle>
          </CardHeader>
          <CardContent>
            <BilgilerFormu hasta={hasta} hassas={hassas} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

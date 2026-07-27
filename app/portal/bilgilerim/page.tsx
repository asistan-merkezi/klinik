import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MusteriDetay } from "@/types/musteri";
import type { MusteriHassasSatir } from "@/types/musteri-hassas";
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
    .from("musteri_kullanici")
    .select("musteri_id, aktif")
    .eq("id", user.id)
    .single();

  if (!mk?.musteri_id || !mk.aktif) {
    redirect("/portal/giris");
  }

  const musteriId = mk.musteri_id;

  const [musteriSonucu, hassasSonucu] = await Promise.all([
    supabase
      .from("musteri")
      .select(
        "id, ad_soyad, telefon, dogum_tarihi, kvkk_onay_tarihi, whatsapp_izin_durumu, cinsiyet, eposta, referans_kanali, ozel_nitelikli_veri_onay_tarihi, ticari_ileti_onay_tarihi"
      )
      .eq("id", musteriId)
      .single<MusteriDetay>(),
    supabase.from("musteri_hassas").select("*").eq("musteri_id", musteriId).maybeSingle<MusteriHassasSatir>(),
  ]);

  const musteri = musteriSonucu.data;
  const hassas = hassasSonucu.data;

  if (!musteri) {
    redirect("/portal");
  }

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Detaylı Bilgilerim</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
            <BilgilerFormu musteri={musteri} hassas={hassas} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

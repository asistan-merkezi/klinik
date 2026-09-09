import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RandevularSihirbazi } from "./sihirbaz";

export default async function RandevularArsivIceAktarmaSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar/arsiv-ice-aktarma");
  }

  const [terapistSonucu, odaSonucu, islemSonucu] = await Promise.all([
    supabase.from("terapist").select("id, personel(ad_soyad)").returns<{ id: string; personel: { ad_soyad: string } | null }[]>(),
    supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
    supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
  ]);

  const terapistler = (terapistSonucu.data ?? [])
    .map((t) => ({ id: t.id, ad: t.personel?.ad_soyad ?? "İsimsiz terapist" }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  const odalar = odaSonucu.data ?? [];
  const islemler = islemSonucu.data ?? [];

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader
          icon={CalendarClock}
          title="Randevu / Seans Geçmişi"
          breadcrumb={
            <Link href="/panel/ayarlar/arsiv-ice-aktarma" className="hover:underline">
              ‹ Arşiv İçe Aktarma
            </Link>
          }
          description="Hastalar bölümü tamamlandıktan sonra kullanın — her satır telefon numarasına göre mevcut bir hastayla eşleştirilir. Aktarılan randevular geçmiş/tamamlanmış olarak işaretlenir, günlük KPI ve doluluk raporlarını etkilemez."
        />

        <Card>
          <CardHeader>
            <CardTitle>Randevu İçe Aktarma</CardTitle>
          </CardHeader>
          <CardContent>
            <RandevularSihirbazi terapistler={terapistler} odalar={odalar} islemler={islemler} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

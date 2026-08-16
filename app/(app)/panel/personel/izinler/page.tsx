import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { IzinTalebiAdminSatir } from "@/types/izin";
import { TalepSatiri } from "./talep-satiri";

export default async function IzinlerSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();
  if (kullanici?.rol !== "klinik_admin") {
    notFound();
  }

  const { data: talepler, error } = await supabase
    .from("personel_izin_talebi")
    .select(
      "id, personel_id, tip, baslangic_tarih, bitis_tarih, gun_sayisi, gerekce, belge_url, durum, red_gerekce, degerlendiren_kullanici_id, degerlendirme_tarihi, iptal_eden_kullanici_id, iptal_tarihi, created_at, personel:personel_id(ad_soyad, gorev)"
    )
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<IzinTalebiAdminSatir[]>();

  const liste = talepler ?? [];
  const bekleyenler = liste.filter((t) => t.durum === "beklemede");
  const sonuclananlar = liste.filter((t) => t.durum !== "beklemede");

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-24 sm:p-8">
        <div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/panel/personel"><ArrowLeft /> Personel</Link>} />
        </div>

        <header>
          <h1 className="text-2xl font-semibold tracking-tight">İzin Talepleri</h1>
          <p className="text-sm text-muted-foreground">Onay bekleyen talepler + geçmiş.</p>
        </header>

        {error && <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Onay Bekleyenler {bekleyenler.length > 0 && `(${bekleyenler.length})`}
          </h2>
          {bekleyenler.length === 0 ? (
            <EmptyState icon={CalendarCheck2} title="Onay bekleyen talep yok." compact />
          ) : (
            <ul className="flex flex-col gap-2">
              {bekleyenler.map((talep) => (
                <TalepSatiri key={talep.id} talep={talep} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Geçmiş</h2>
          {sonuclananlar.length === 0 ? (
            <EmptyState icon={CalendarCheck2} title="Henüz sonuçlanmış talep yok." compact />
          ) : (
            <ul className="flex flex-col gap-2">
              {sonuclananlar.map((talep) => (
                <TalepSatiri key={talep.id} talep={talep} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

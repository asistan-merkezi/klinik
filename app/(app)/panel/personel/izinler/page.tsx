import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarCheck2, FileHeart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/datetime";
import type { IzinTalebiAdminSatir } from "@/types/izin";
import { TalepSatiri } from "./talep-satiri";
import { ManuelIzinEkleDialog } from "./manuel-izin-ekle-dialog";
import { ManuelRaporEkleDialog } from "./manuel-rapor-ekle-dialog";

type RaporSatiri = {
  tarih: string;
  not_metni: string | null;
  personel: { ad_soyad: string; gorev: string } | null;
};

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

  const [{ data: talepler, error }, { data: personelListesi }, { data: raporlar }] = await Promise.all([
    supabase
      .from("personel_izin_talebi")
      .select(
        "id, personel_id, tip, baslangic_tarih, bitis_tarih, gun_sayisi, gerekce, belge_url, durum, red_gerekce, degerlendiren_kullanici_id, degerlendirme_tarihi, iptal_eden_kullanici_id, iptal_tarihi, created_at, personel:personel_id(ad_soyad, gorev)"
      )
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<IzinTalebiAdminSatir[]>(),
    supabase.from("personel").select("id, ad_soyad, gorev").eq("aktif", true).order("ad_soyad"),
    supabase
      .from("personel_puantaj")
      .select("tarih, not_metni, personel:personel_id(ad_soyad, gorev)")
      .eq("durum", "raporlu")
      .order("tarih", { ascending: false })
      .limit(50)
      .returns<RaporSatiri[]>(),
  ]);

  const liste = talepler ?? [];
  const bekleyenler = liste.filter((t) => t.durum === "beklemede");
  const sonuclananlar = liste.filter((t) => t.durum !== "beklemede");
  const raporListesi = raporlar ?? [];

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-24 sm:p-8">
        <div>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/panel/personel"><ArrowLeft /> Personel</Link>} />
        </div>

        <PageHeader
          title="İzin / Rapor Takibi"
          description="Onay bekleyen izin talepleri + manuel izin/rapor girişi."
          icon={CalendarCheck2}
          actions={
            <>
              <ManuelIzinEkleDialog personelListesi={personelListesi ?? []} />
              <ManuelRaporEkleDialog personelListesi={personelListesi ?? []} />
            </>
          }
        />

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
          <h2 className="text-sm font-semibold text-muted-foreground">İzin Geçmişi</h2>
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

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Raporlu Günler</h2>
          {raporListesi.length === 0 ? (
            <EmptyState icon={FileHeart} title="Kayıtlı raporlu gün yok." compact />
          ) : (
            <ul className="flex flex-col gap-1.5 rounded-lg border border-border p-2 text-sm">
              {raporListesi.map((r, i) => (
                <li key={`${r.personel?.ad_soyad}-${r.tarih}-${i}`} className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{r.personel?.ad_soyad ?? "—"}</span>{" "}
                    <span className="text-muted-foreground">· {r.personel?.gorev}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(r.tarih)}
                    {r.not_metni && ` · ${r.not_metni}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

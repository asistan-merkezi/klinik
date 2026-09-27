import { redirect } from "next/navigation";
import { CalendarOff, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { IzinBakiye, IzinTalebi } from "@/types/izin";
import { BakiyeKarti } from "./bakiye-karti";
import { TalepFormu, type PersonelSecici } from "./talep-formu";
import { TalepListesi } from "./talep-listesi";

export default async function IzinlerimSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const [{ data: kullanici }, { data: personel }] = await Promise.all([
    supabase.from("kullanici").select("rol").eq("id", user.id).single(),
    supabase.from("personel").select("id, ad_soyad").eq("kullanici_id", user.id).maybeSingle(),
  ]);

  // klinik_admin/muhasebe kendi adına talep açmanın yanı sıra, departman →
  // kişi seçerek BAŞKA bir personel adına da talep açabilir (bkz. kök
  // CLAUDE.md İzin/Rapor akışı) — bu yüzden personel kaydı olmasalar bile
  // sayfa boş dönmüyor, sadece Bakiye/Taleplerim bölümleri atlanıyor.
  const secimYapabilir = kullanici?.rol === "klinik_admin" || kullanici?.rol === "muhasebe";

  if (!personel && !secimYapabilir) {
    return (
      <div className="flex-1 bg-background p-4 sm:p-8">
        <div className="mx-auto max-w-2xl">
          <EmptyState icon={CalendarOff} title="Bu hesaba bağlı bir personel kaydı bulunamadı." />
        </div>
      </div>
    );
  }

  const [{ data: bakiye }, { data: talepler }, { data: personelListesiSonucu }] = await Promise.all([
    personel
      ? supabase.from("v_personel_izin_bakiye").select("*").eq("personel_id", personel.id).maybeSingle<IzinBakiye>()
      : Promise.resolve({ data: null }),
    personel
      ? supabase
          .from("personel_izin_talebi")
          .select(
            "id, personel_id, tip, baslangic_tarih, bitis_tarih, gun_sayisi, gerekce, belge_url, durum, red_gerekce, degerlendiren_kullanici_id, degerlendirme_tarihi, iptal_eden_kullanici_id, iptal_tarihi, created_at"
          )
          .eq("personel_id", personel.id)
          .order("created_at", { ascending: false })
          .returns<IzinTalebi[]>()
      : Promise.resolve({ data: null }),
    secimYapabilir
      ? supabase
          .from("personel")
          .select("id, ad_soyad, pozisyon:pozisyon_id(grup)")
          .eq("aktif", true)
          .order("ad_soyad")
          .returns<{ id: string; ad_soyad: string; pozisyon: { grup: string } | null }[]>()
      : Promise.resolve({ data: null }),
  ]);

  const personelSecici: PersonelSecici = secimYapabilir
    ? {
        mod: "sec",
        personelListesi: (personelListesiSonucu ?? []).map((p) => ({
          id: p.id,
          adSoyad: p.ad_soyad,
          departman: p.pozisyon?.grup ?? "Diğer",
        })),
      }
    : { mod: "kendi", adSoyad: personel!.ad_soyad };

  return (
    <div className="flex-1 bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 pb-24 sm:p-8">
        <PageHeader title="İzin Talep Formu" description="Yeni izin talep giriş sayfası." icon={CalendarClock} />

        {bakiye && <BakiyeKarti bakiye={bakiye} />}

        <TalepFormu personelSecici={personelSecici} />

        {personel && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Taleplerim</h2>
            {!talepler || talepler.length === 0 ? (
              <EmptyState icon={CalendarOff} title="Henüz izin talebiniz yok." compact />
            ) : (
              <TalepListesi talepler={talepler} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

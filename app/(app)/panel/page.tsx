import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RandevuSatir, SecenekSatir } from "@/types/randevu";
import { gunAraligi } from "@/lib/utils";
import { CanliCizelge } from "@/components/panel/canli-cizelge";
import { bildirimVerileriGetir } from "@/app/(app)/panel/hastalar/bildirimler/bildirim-verileri";
import { BildirimListesi } from "@/app/(app)/panel/hastalar/bildirimler/bildirim-listesi";

export default async function PanelSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();
  const rol = kullanici?.rol ?? null;
  const bildirimGorulebilir = rol === "klinik_admin" || rol === "resepsiyon";

  let kendiTerapistId: string | null = null;
  if (rol === "terapist") {
    const { data: personel } = await supabase
      .from("personel")
      .select("id")
      .eq("kullanici_id", user.id)
      .maybeSingle();
    if (personel) {
      const { data: terapist } = await supabase
        .from("terapist")
        .select("id")
        .eq("personel_id", personel.id)
        .maybeSingle();
      kendiTerapistId = terapist?.id ?? null;
    }
  }

  const { baslangic, bitis } = gunAraligi();
  const [randevularSonucu, odaSonucu, terapistSonucu, cihazSonucu, tedaviSonucu, personelSonucu, protokolSonucu] =
    await Promise.all([
      supabase
        .from("randevu")
        .select(
          "id, baslangic, bitis, durum, gecikme_dakika, hasta_id, terapist_id, oda_id, cihaz_id, hasta(ad_soyad), oda(ad), terapist(personel(ad_soyad)), islem_tanimi_id, islem_tanimi(id, ad), tani, antrenor_id, antrenor:personel(ad_soyad), tedavi_protokolu_id, tedavi_protokolu(id, ad)"
        )
        .gte("baslangic", baslangic)
        .lt("baslangic", bitis)
        .order("baslangic")
        .returns<RandevuSatir[]>(),
      supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
      supabase
        .from("terapist")
        .select("id, personel(ad_soyad)")
        .returns<{ id: string; personel: { ad_soyad: string } | null }[]>(),
      supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("islem_tanimi").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("personel").select("id, ad_soyad").eq("aktif", true).order("ad_soyad"),
      supabase.from("tedavi_protokolu").select("id, ad").eq("aktif", true).order("ad"),
    ]);

  const { data: randevular, error } = randevularSonucu;
  const odalar: SecenekSatir[] = (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad }));
  const terapistler: SecenekSatir[] = (terapistSonucu.data ?? [])
    .map((t) => ({ id: t.id, ad: t.personel?.ad_soyad ?? "—" }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));
  const tedaviler: SecenekSatir[] = (tedaviSonucu.data ?? []).map((t) => ({ id: t.id, ad: t.ad }));
  const antrenorler: SecenekSatir[] = (personelSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad_soyad }));
  const protokoller: SecenekSatir[] = (protokolSonucu.data ?? []).map((p) => ({ id: p.id, ad: p.ad }));

  if (error) {
    console.error("Bugünkü randevular çekilemedi:", error);
  }

  const bildirimVerisi = bildirimGorulebilir ? await bildirimVerileriGetir(supabase) : null;

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {bildirimVerisi && <BildirimListesi veri={bildirimVerisi} bosKenGoster={false} />}

        {error ? (
          <p className="text-sm text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</p>
        ) : (
          <CanliCizelge
            baslangicRandevular={randevular ?? []}
            odalar={odalar}
            terapistler={terapistler}
            cihazlar={cihazlar}
            tedaviler={tedaviler}
            antrenorler={antrenorler}
            protokoller={protokoller}
            rol={rol}
            kendiTerapistId={kendiTerapistId}
          />
        )}
      </div>
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import type { RandevuSatir, SecenekSatir, TedaviSecenekSatir } from "@/types/randevu";
import { GeriLink } from "../geri-link";
import { RandevuSeansSekmesi } from "../sekmeler/randevu-seans-sekmesi";
import { getAuthUser, hastaTemelGetir, kullaniciRolGetir } from "../hasta-getir";
import { atanabilirTerapistleriGetir } from "@/lib/personel/atanabilir-terapistler";

const RANDEVU_ARSIV_SELECT =
  "id, baslangic, bitis, durum, gecikme_dakika, terapist(personel(ad_soyad)), oda(ad), islem_tanimi(id, ad), kaynak";

export default async function RandevuSeansSayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();

  if (!user) {
    redirect("/giris");
  }

  const hasta = await hastaTemelGetir(id);
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(user.id);
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";

  const supabase = await createClient();
  const [periyodikRandevuSonucu, randevuListesiSonucu, islemTanimiSonucu, terapistler, odaSonucu, cihazSonucu] =
    await Promise.all([
      supabase
        .from("periyodik_randevu")
        .select(
          "id, haftanin_gunu, saat, sure_dakika, durum, bitis_tarihi, otomatik_yenile, terapist(personel(ad_soyad)), oda(ad), islem_tanimi(ad)"
        )
        .eq("hasta_id", id)
        .eq("durum", "aktif")
        .order("haftanin_gunu")
        .returns<PeriyodikRandevuSatir[]>(),
      supabase
        .from("randevu")
        .select(RANDEVU_ARSIV_SELECT)
        .eq("hasta_id", id)
        .order("baslangic", { ascending: false })
        .limit(100)
        .returns<RandevuSatir[]>(),
      supabase.from("islem_tanimi").select("id, ad, sure_dakika").eq("aktif", true).order("ad"),
      atanabilirTerapistleriGetir(supabase),
      supabase.from("oda").select("id, ad").eq("aktif", true).order("ad"),
      supabase.from("cihaz").select("id, ad").eq("aktif", true).order("ad"),
    ]);

  const periyodikRandevular = periyodikRandevuSonucu.data ?? [];
  const randevuListesi = randevuListesiSonucu.data ?? [];
  const tedaviler: TedaviSecenekSatir[] = (islemTanimiSonucu.data ?? []).map((i) => ({
    id: i.id,
    ad: i.ad,
    sure_dakika: i.sure_dakika,
  }));
  const odalar: SecenekSatir[] = (odaSonucu.data ?? []).map((o) => ({ id: o.id, ad: o.ad }));
  const cihazlar: SecenekSatir[] = (cihazSonucu.data ?? []).map((c) => ({ id: c.id, ad: c.ad }));

  return (
    <div className="flex flex-col gap-3">
      <GeriLink hastaId={id} baslik="Randevu & Seans" />
      <RandevuSeansSekmesi
        hastaId={hasta.id}
        hastaAdSoyad={hasta.ad_soyad}
        duzenlenebilir={duzenlenebilir}
        periyodikRandevular={periyodikRandevular}
        randevuListesi={randevuListesi}
        terapistler={terapistler}
        odalar={odalar}
        cihazlar={cihazlar}
        tedaviler={tedaviler}
      />
    </div>
  );
}

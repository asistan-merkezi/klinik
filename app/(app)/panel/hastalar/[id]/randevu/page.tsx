import { notFound, redirect } from "next/navigation";
import { withTenant } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { GeriLink } from "../geri-link";
import { RandevuSeansSekmesi } from "../sekmeler/randevu-seans-sekmesi";
import { getAuthUser, hastaTemelGetir, kullaniciRolGetir } from "../hasta-getir";
import { atanabilirTerapistleriGetir } from "@/lib/personel/atanabilir-terapistler";
import { tedaviSecenekleriGetir } from "@/lib/randevu/tedavi-secenekleri";
import { cihazSecenekleriGetir, hastaPeriyodikRandevulariGetir, hastaRandevuListesiGetir, odaSecenekleriGetir } from "@/lib/randevu/sorgular";

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

  const ctx = await oturumBaglami();
  if (!ctx) redirect("/giris");
  const v = await withTenant(tenantGerekli(ctx), async (tx) => ({
    periyodikRandevular: await hastaPeriyodikRandevulariGetir(tx, id),
    randevuListesi: await hastaRandevuListesiGetir(tx, id, 100),
    tedaviler: await tedaviSecenekleriGetir(tx),
    terapistler: await atanabilirTerapistleriGetir(tx),
    odalar: await odaSecenekleriGetir(tx),
    cihazlar: await cihazSecenekleriGetir(tx),
  }));

  return (
    <div className="flex flex-col gap-3">
      <GeriLink hastaId={id} baslik="Randevu & Seans" />
      <RandevuSeansSekmesi
        hastaId={hasta.id}
        hastaAdSoyad={hasta.ad_soyad}
        duzenlenebilir={duzenlenebilir}
        periyodikRandevular={v.periyodikRandevular}
        randevuListesi={v.randevuListesi}
        terapistler={v.terapistler}
        odalar={v.odalar}
        cihazlar={v.cihazlar}
        tedaviler={v.tedaviler}
      />
    </div>
  );
}

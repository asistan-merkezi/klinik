import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import type { FaturaBilgisiKontrol } from "@/lib/fatura/eksik-bilgi";
import { aktifPaketSatislariGetir, bakiyeHareketleriGetir, hastaBakiyesiGetir, iskontoOranlariGetir } from "@/lib/hasta/cari-sorgular";
import { bankaHesaplariGetir } from "@/lib/randevu/sorgular";
import { GeriLink } from "../geri-link";
import { CariOdemeSekmesi } from "../sekmeler/cari-odeme-sekmesi";
import { getAuthUser, hastaTemelGetir, kullaniciRolGetir } from "../hasta-getir";

export default async function CariOdemeSayfasi({
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
  if (rol === "terapist") {
    redirect(`/panel/hastalar/${id}`);
  }
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";

  const ctx = await oturumBaglami();
  if (!ctx) redirect("/giris");
  const v = await withTenant(tenantGerekli(ctx), async (tx) => ({
    aktifPaketler: await aktifPaketSatislariGetir(tx, id),
    bakiyeHareketleri: await bakiyeHareketleriGetir(tx, id, 30),
    oranlar: await iskontoOranlariGetir(tx),
    guncelBakiye: await hastaBakiyesiGetir(tx, id),
    hassas: (await tx.select({ kimlikNo: sema.hastaHassas.kimlikNo, adres: sema.hastaHassas.adres }).from(sema.hastaHassas).where(eq(sema.hastaHassas.hastaId, id)).limit(1))[0] ?? null,
    bankaHesaplari: await bankaHesaplariGetir(tx),
  }));

  const faturaBilgisi: FaturaBilgisiKontrol = {
    adSoyad: hasta.ad_soyad,
    eposta: hasta.eposta ?? null,
    adres: v.hassas?.adres ?? null,
    kimlikNo: v.hassas?.kimlikNo ?? null,
  };

  return (
    <div className="flex flex-col gap-3">
      <GeriLink hastaId={id} baslik="Cari & Ödeme" />
      <CariOdemeSekmesi
        hastaId={hasta.id}
        hastaAdSoyad={hasta.ad_soyad}
        hastaKategori={hasta.kategori}
        iskontoOranlari={v.oranlar}
        guncelBakiye={v.guncelBakiye}
        duzenlenebilir={duzenlenebilir}
        aktifPaketler={v.aktifPaketler}
        bakiyeHareketleri={v.bakiyeHareketleri}
        faturaBilgisi={faturaBilgisi}
        bankaHesaplari={v.bankaHesaplari}
      />
    </div>
  );
}

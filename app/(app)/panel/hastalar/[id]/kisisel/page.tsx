import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { sema, withTenant } from "@/lib/db";
import { oturumBaglami } from "@/lib/auth/gecerli-kullanici";
import { tenantGerekli } from "@/lib/auth/oturum";
import { GeriLink } from "../geri-link";
import { KisiselBilgilerSekmesi } from "../sekmeler/kisisel-bilgiler-sekmesi";
import { getAuthUser, hastaDetayFullGetir, kullaniciRolGetir } from "../hasta-getir";

export default async function KisiselBilgilerSayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, hasta] = await Promise.all([getAuthUser(), hastaDetayFullGetir(id)]);

  if (!user) {
    redirect("/giris");
  }
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(user.id);
  if (rol === "terapist") {
    redirect(`/panel/hastalar/${id}`);
  }
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";

  const ctx = await oturumBaglami();
  const hastaKullanici = ctx
    ? (await withTenant(tenantGerekli(ctx), (tx) => tx.select({ aktif: sema.hastaKullanici.aktif }).from(sema.hastaKullanici).where(eq(sema.hastaKullanici.hastaId, id)).limit(1)))[0]
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <GeriLink hastaId={id} baslik="Kişisel Bilgiler" />
      <KisiselBilgilerSekmesi
        hasta={hasta}
        aktif
        duzenlenebilir={duzenlenebilir}
        portalDurumu={{ var: hastaKullanici != null, aktif: hastaKullanici?.aktif ?? false }}
      />
    </div>
  );
}

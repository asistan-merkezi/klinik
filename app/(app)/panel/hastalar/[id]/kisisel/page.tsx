import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GeriLink } from "../geri-link";
import { KisiselBilgilerSekmesi } from "../sekmeler/kisisel-bilgiler-sekmesi";
import { getAuthUser, hastaDetayFullGetir, kullaniciRolGetir } from "../hasta-getir";

export default async function KisiselBilgilerSayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [user, hasta, hastaKullaniciSonucu] = await Promise.all([
    getAuthUser(),
    hastaDetayFullGetir(id),
    supabase.from("hasta_kullanici").select("aktif").eq("hasta_id", id).maybeSingle(),
  ]);

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
  const hastaKullanici = hastaKullaniciSonucu.data;

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

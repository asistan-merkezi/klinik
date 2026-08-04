import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GeriLink } from "../geri-link";
import { KisiselBilgilerSekmesi } from "../sekmeler/kisisel-bilgiler-sekmesi";
import { hastaDetayFullGetir, kullaniciRolGetir } from "../hasta-getir";

export default async function KisiselBilgilerSayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const hasta = await hastaDetayFullGetir(supabase, id);
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(supabase, user.id);
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";

  const { data: hastaKullanici } = await supabase
    .from("hasta_kullanici")
    .select("aktif")
    .eq("hasta_id", id)
    .maybeSingle();

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

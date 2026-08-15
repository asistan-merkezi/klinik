import { notFound, redirect } from "next/navigation";
import { GeriLink } from "../geri-link";
import { TedaviAnamnezSekmesi } from "../sekmeler/tedavi-anamnez-sekmesi";
import { getAuthUser, hastaDetayFullGetir, kullaniciRolGetir } from "../hasta-getir";

export default async function TedaviAnamnezSayfasi({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAuthUser();

  if (!user) {
    redirect("/giris");
  }

  const hasta = await hastaDetayFullGetir(id);
  if (!hasta) {
    notFound();
  }

  const rol = await kullaniciRolGetir(user.id);
  const duzenlenebilir = rol === "klinik_admin" || rol === "resepsiyon";
  const terapistMi = rol === "terapist";

  return (
    <div className="flex flex-col gap-3">
      <GeriLink hastaId={id} baslik="Tedavi & Anamnez" />
      <TedaviAnamnezSekmesi hasta={hasta} aktif duzenlenebilir={duzenlenebilir || terapistMi} rol={rol} />
    </div>
  );
}

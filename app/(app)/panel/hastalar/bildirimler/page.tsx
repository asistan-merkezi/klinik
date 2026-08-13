import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bildirimVerileriGetir } from "./bildirim-verileri";
import { BildirimListesi } from "./bildirim-listesi";

export default async function HastaBildirimleriSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin" && kullanici?.rol !== "resepsiyon") {
    redirect("/panel/hastalar");
  }

  const veri = await bildirimVerileriGetir(supabase);

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Bildirimler</h1>
          <p className="text-sm text-muted-foreground">
            Hastaların portaldan gönderdiği randevu talep/iptal talepleri, seans sonu değerlendirmeleri ve Anket ve
            Öneriler yanıtları.
          </p>
        </header>

        <BildirimListesi veri={veri} />
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BasvuruListesi } from "./basvuru-listesi";

export default async function IsBasvurulariSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase.from("kullanici").select("rol, klinik_id").eq("id", user.id).single();

  if (kullanici?.rol !== "klinik_admin") {
    redirect("/panel/ayarlar");
  }

  const { data: basvurular } = await supabase
    .from("is_basvurusu")
    .select("id, ad_soyad, telefon, eposta, pozisyon, mesaj, durum, created_at")
    .eq("klinik_id", kullanici.klinik_id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">İş Başvuruları</h1>
          <p className="text-sm text-muted-foreground">QR kod üzerinden gelen iş başvuruları.</p>
        </header>

        <BasvuruListesi basvurular={basvurular ?? []} />
      </div>
    </div>
  );
}

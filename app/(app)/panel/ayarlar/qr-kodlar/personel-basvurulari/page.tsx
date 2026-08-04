import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BasvuruListesi } from "./basvuru-listesi";

export default async function PersonelBasvurulariSayfasi() {
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
    .from("personel_basvuru_taslagi")
    .select("id, ad_soyad, telefon, eposta, basvurulan_gorev, dogum_tarihi, mesaj, durum, created_at")
    .eq("klinik_id", kullanici.klinik_id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Personel Başvuruları</h1>
          <p className="text-sm text-muted-foreground">
            QR kod üzerinden gelen personel başvuruları. Onaylamak hesap açmaz — Personel sayfasından
            gerçek kaydı siz oluşturursunuz.
          </p>
        </header>

        <BasvuruListesi basvurular={basvurular ?? []} />
      </div>
    </div>
  );
}

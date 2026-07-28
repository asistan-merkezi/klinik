import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SirketBilgileri } from "@/types/klinik";
import { SirketBilgileriFormu } from "./sirket-bilgileri-formu";

export default async function SirketBilgileriSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("klinik_id, rol")
    .eq("id", user.id)
    .single();

  const duzenlenebilir = kullanici?.rol === "klinik_admin";

  const { data: bilgiler } = await supabase
    .from("klinik")
    .select(
      "unvan, adres, vergi_dairesi, vergi_no, telefon, whatsapp_no, eposta, yetkili_kisi, yetkili_telefon, yetkili_eposta, logo_url"
    )
    .eq("id", kullanici?.klinik_id ?? "")
    .maybeSingle<SirketBilgileri>();

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Şirket Bilgileri</h1>
          <p className="text-sm text-muted-foreground">
            Fatura ve kurumsal iletişimde kullanılan şirket profili.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Kurumsal Bilgiler</CardTitle>
          </CardHeader>
          <CardContent>
            {duzenlenebilir ? (
              <SirketBilgileriFormu bilgiler={bilgiler} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Bu bilgileri yalnızca klinik yöneticisi düzenleyebilir.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

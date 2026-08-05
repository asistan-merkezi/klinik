import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IskontoOranlari } from "@/types/iskonto-oranlari";
import { IskontoOranlariFormu } from "./iskonto-oranlari-formu";

export default async function IskontoOranlariSayfasi() {
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

  const { data: oranlar } = await supabase
    .from("iskonto_oranlari")
    .select("vita_pct, plus_pct, elit_pct, prime_pct")
    .eq("klinik_id", kullanici?.klinik_id ?? "")
    .maybeSingle<IskontoOranlari>();

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">İskonto Oranları</h1>
          <p className="text-sm text-muted-foreground">
            Hasta kategorisine (Vita/Plus/Elit/Prime) göre tedavi fiyatına otomatik uygulanacak
            iskonto yüzdeleri — bir tedavide o kademe için özel fiyat girilmemişse burada
            tanımlanan oran Vita fiyatına uygulanır.
          </p>
        </header>

        <Card className="bg-surface-2">
          <CardHeader>
            <CardTitle>Kademe Yüzdeleri</CardTitle>
          </CardHeader>
          <CardContent>
            {duzenlenebilir ? (
              <IskontoOranlariFormu oranlar={oranlar} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Bu oranları yalnızca klinik yöneticisi düzenleyebilir.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MuhasebeEntegrasyonDurum } from "@/types/muhasebe-entegrasyon";
import { MuhasebeSyncFormu } from "./muhasebe-sync-formu";

export default async function MuhasebeSyncSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const { data: kullanici } = await supabase
    .from("kullanici")
    .select("rol")
    .eq("id", user.id)
    .single();

  const duzenlenebilir = kullanici?.rol === "klinik_admin";

  // Client secret burada BİLEREK seçilmiyor; ekrana hiçbir zaman taşınmaz.
  const { data: durum } = await supabase
    .from("klinik_muhasebe_entegrasyonu")
    .select("parasut_client_id, parasut_company_id, baglanti_durumu, updated_at")
    .maybeSingle<MuhasebeEntegrasyonDurum>();

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">Muhasebe Sync</h1>
          <p className="text-sm text-muted-foreground">
            Muhasebe bölümünü (fatura kesimi) senkronize edecek Paraşüt API bağlantısı.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>
              Bağlantı durumu:{" "}
              {durum?.baglanti_durumu === "baglandi" ? (
                <span className="text-emerald-600 dark:text-emerald-400">Bağlandı</span>
              ) : (
                <span className="text-muted-foreground">Bekliyor</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {durum?.updated_at && (
              <p className="text-xs text-muted-foreground">
                Son güncelleme: {new Date(durum.updated_at).toLocaleString("tr-TR")}
              </p>
            )}

            {duzenlenebilir ? (
              <MuhasebeSyncFormu durum={durum} />
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

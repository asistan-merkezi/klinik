import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function YetkilendirmeSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  return (
    <div className="flex-1 bg-background p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          icon={ShieldCheck}
          title="Yetkilendirme"
          description="Rollerin (klinik_admin, resepsiyon, terapist) hangi ekrana/işleme erişebildiğini yönet."
        />

        <Card>
          <CardHeader>
            <CardTitle>Yakında</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Bu ekran henüz hazır değil. Rol bazlı yetkilendirme şu an veritabanı seviyesinde
              (RLS) uygulanıyor.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

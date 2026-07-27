import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function KamusalGiderlerSayfasi() {
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
        <header>
          <h1 className="text-xl font-semibold">Kamusal Giderler</h1>
          <p className="text-sm text-muted-foreground">
            Vergi, SGK ve diğer resmi kesinti/ödeme takibi.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Yakında</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Bu ekran henüz hazır değil.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

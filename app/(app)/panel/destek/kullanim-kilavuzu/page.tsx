import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function KullanimKilavuzuSayfasi() {
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
          <h1 className="text-xl font-semibold">Kullanım Kılavuzu</h1>
          <p className="text-sm text-muted-foreground">
            Panelin modüllerini adım adım anlatan yazılı rehber.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Yakında eklenecek</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Kullanım kılavuzu içeriği hazırlanıyor. O zamana kadar sorularınız için{" "}
              <span className="font-medium text-foreground">Destek Chatbotu</span>&apos;nu
              kullanabilirsiniz.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

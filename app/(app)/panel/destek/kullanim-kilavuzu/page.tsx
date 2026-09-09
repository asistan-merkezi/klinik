import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

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
        <PageHeader
          icon={BookOpen}
          title="Kullanım Kılavuzu"
          description="Panelin modüllerini adım adım anlatan yazılı rehber."
        />

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

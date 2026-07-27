import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WhatsappAyarlariSayfasi() {
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
          <h1 className="text-xl font-semibold">WhatsApp Bağlantısı</h1>
          <p className="text-sm text-muted-foreground">
            Randevu hatırlatma ve paket/bakiye bildirimleri için WhatsApp Business hesabı.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Henüz bağlı değil</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Meta WhatsApp Business hesabı ve numara kurulumu tamamlanınca bu ekrandan
              yönetilecek.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

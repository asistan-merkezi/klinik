import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SohbetArayuzu } from "./sohbet-arayuzu";

export default async function DestekChatbotuSayfasi() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  return (
    <div className="flex flex-1 flex-col bg-background p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
        <header>
          <h1 className="text-xl font-semibold">Destek Chatbotu</h1>
          <p className="text-sm text-muted-foreground">
            Panelin nasıl kullanılacağıyla ilgili sorularınızı sorun. Gerçek hasta/ödeme verisi
            görmez, sadece panel kullanımında yardımcı olur.
          </p>
        </header>

        <SohbetArayuzu />
      </div>
    </div>
  );
}

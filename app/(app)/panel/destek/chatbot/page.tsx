import { Bot } from "lucide-react";
import { panelBaglami } from "@/lib/auth/yetki";
import { chatbotAcikMi } from "@/lib/destek-chatbot/bayrak";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SohbetArayuzu } from "./sohbet-arayuzu";

export default async function DestekChatbotuSayfasi() {
  await panelBaglami();
  const acik = chatbotAcikMi();

  return (
    <div className="flex flex-1 flex-col bg-background p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
        <PageHeader
          icon={Bot}
          title="Destek Chatbotu"
          description="Panelin nasıl kullanılacağıyla ilgili sorularınızı sorun. Gerçek hasta/ödeme verisi görmez, sadece panel kullanımında yardımcı olur."
        />

        {acik ? (
          <>
            <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Yazdıklarınız yapay zekâ servisine iletilir. Hasta adı, kimlik, telefon veya sağlık bilgisi YAZMAYIN; kimlik/telefon/IBAN numaraları gönderilmeden önce otomatik silinir.
            </p>
            <SohbetArayuzu />
          </>
        ) : (
          <EmptyState icon={Bot} title="Destek chatbotu bu klinikte etkin değil." description="Kullanım sorularınız için Talep ve Şikayetler bölümünden bize yazabilirsiniz." />
        )}
      </div>
    </div>
  );
}

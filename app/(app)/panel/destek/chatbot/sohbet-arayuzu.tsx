"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, Send, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASLANGIC_MESAJI =
  'Merhaba! Panelin kullanımıyla ilgili sorularınızı yanıtlayabilirim — örneğin "bir hastaya nasıl ödeme eklerim?" ya da "randevu nasıl ertelenir?" gibi.';

export function SohbetArayuzu() {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/destek-chatbot" }),
  });
  const [girdi, setGirdi] = useState("");

  function gonder(e: React.FormEvent) {
    e.preventDefault();
    const metin = girdi.trim();
    if (!metin || status !== "ready") return;
    sendMessage({ text: metin });
    setGirdi("");
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <MesajBalonu rol="assistant">{BASLANGIC_MESAJI}</MesajBalonu>

        {messages.map((mesaj) => (
          <MesajBalonu key={mesaj.id} rol={mesaj.role === "user" ? "user" : "assistant"}>
            {mesaj.parts.map((parca, i) =>
              parca.type === "text" ? <span key={i}>{parca.text}</span> : null
            )}
          </MesajBalonu>
        ))}

        {status === "submitted" && (
          <MesajBalonu rol="assistant">
            <span className="text-muted-foreground">Yazıyor…</span>
          </MesajBalonu>
        )}

        {error && (
          <MesajBalonu rol="assistant">
            <span className="text-destructive">Bir hata oluştu, lütfen tekrar deneyin.</span>
          </MesajBalonu>
        )}
      </div>

      <form onSubmit={gonder} className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={girdi}
          onChange={(e) => setGirdi(e.target.value)}
          placeholder="Bir soru yazın…"
          disabled={status !== "ready"}
          className="h-10"
        />
        <Button type="submit" size="icon-lg" disabled={status !== "ready" || !girdi.trim()}>
          <Send />
        </Button>
      </form>
    </div>
  );
}

function MesajBalonu({ rol, children }: { rol: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2", rol === "user" && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          rol === "assistant" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}
        aria-hidden
      >
        {rol === "assistant" ? <Bot className="size-4" /> : <User className="size-4" />}
      </div>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
          rol === "assistant" ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
        )}
      >
        {children}
      </div>
    </div>
  );
}

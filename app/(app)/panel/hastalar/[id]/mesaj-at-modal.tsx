"use client";

import { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Megaphone, MessageSquareText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { MesajKanal } from "@/types/mesajlasma";
import { hastaMesajSecenekleriGetir, hastaMesajiGonder, type HastaMesajSecenegi } from "./mesaj-actions";

const KANAL_ETIKETLERI: { kanal: MesajKanal; etiket: string }[] = [
  { kanal: "sms", etiket: "SMS" },
  { kanal: "whatsapp", etiket: "WhatsApp" },
  { kanal: "mail", etiket: "E-posta" },
];

export function MesajAtModal({
  acik,
  onOpenChange,
  hastaId,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  hastaId: string;
}) {
  const [secilen, setSecilen] = useState<HastaMesajSecenegi | null>(null);
  const [metin, setMetin] = useState("");
  const [kanallar, setKanallar] = useState<MesajKanal[]>(["sms"]);
  const [sonuc, setSonuc] = useState<{ success: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data, isLoading } = useQuery({
    queryKey: ["hasta_mesaj_secenekleri", hastaId],
    queryFn: () => hastaMesajSecenekleriGetir(hastaId),
    enabled: acik,
    staleTime: 0,
  });

  const hata = data && "hata" in data ? data.hata : null;
  const secenekler = data && "secenekler" in data ? data : null;

  function kapat(yeniAcik: boolean) {
    onOpenChange(yeniAcik);
    if (!yeniAcik) {
      setSecilen(null);
      setSonuc(null);
      setKanallar(["sms"]);
    }
  }

  function sec(s: HastaMesajSecenegi) {
    setSecilen(s);
    setMetin(s.metin);
    setSonuc(null);
    // Varsayılan: SMS; hastanın SMS'i yoksa erişilebilen ilk kanal.
    const ilk = KANAL_ETIKETLERI.find((k) => secenekler?.kanallar[k.kanal])?.kanal;
    setKanallar(secenekler?.kanallar.sms ? ["sms"] : ilk ? [ilk] : []);
  }

  function kanalDegistir(kanal: MesajKanal) {
    setKanallar((onceki) => (onceki.includes(kanal) ? onceki.filter((k) => k !== kanal) : [...onceki, kanal]));
  }

  function gonder() {
    if (!secilen) return;
    startTransition(async () => {
      const s = await hastaMesajiGonder(hastaId, { kod: secilen.kod, metin, kanallar });
      setSonuc(s);
      if (s.success) setSecilen(null);
    });
  }

  return (
    <Dialog open={acik} onOpenChange={kapat}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mesaj At</DialogTitle>
          <DialogDescription>
            {secilen ? secilen.ad : "Hastaya göndermek istediğiniz mesajı seçin."}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Yükleniyor…</p>}
        {hata && <p className="text-sm text-destructive">{hata}</p>}

        {sonuc && (
          <p
            role="status"
            className={cn(
              "rounded-xl px-3 py-2 text-sm",
              sonuc.success ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-destructive/10 text-destructive"
            )}
          >
            {sonuc.message}
          </p>
        )}

        {secenekler && !secilen && (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {secenekler.secenekler.map((s) => (
              <li key={s.kod}>
                <button
                  type="button"
                  disabled={s.engelli}
                  onClick={() => sec(s)}
                  className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {s.ad}
                      {s.ticari && (
                        <StatusBadge tone={s.engelli ? "rose" : "sky"}>
                          {s.engelli ? "Ticari ileti onayı yok" : "Ticari"}
                        </StatusBadge>
                      )}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{s.metin}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {secenekler && secilen && (
          <div className="flex flex-col gap-3">
            <Textarea value={metin} readOnly rows={5} maxLength={1000} aria-label="Mesaj metni (önizleme)" />

            <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
              <legend className="sr-only">Kanal</legend>
              {KANAL_ETIKETLERI.map(({ kanal, etiket }) => {
                const uygun = secenekler.kanallar[kanal];
                return (
                  <label
                    key={kanal}
                    className={cn("flex items-center gap-2 text-sm", !uygun && "cursor-not-allowed text-muted-foreground")}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      disabled={!uygun}
                      checked={uygun && kanallar.includes(kanal)}
                      onChange={() => kanalDegistir(kanal)}
                    />
                    {etiket}
                    {!uygun && <span className="text-xs">(bilgi/izin yok)</span>}
                  </label>
                );
              })}
            </fieldset>

            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setSecilen(null)} disabled={isPending}>
                <ArrowLeft className="size-4" aria-hidden />
                Listeye dön
              </Button>
              <Button type="button" onClick={gonder} disabled={isPending || !metin.trim() || kanallar.length === 0}>
                <Megaphone className="size-4" aria-hidden />
                {isPending ? "Gönderiliyor…" : "Gönder"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

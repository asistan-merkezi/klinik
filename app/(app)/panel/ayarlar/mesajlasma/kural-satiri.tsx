"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KANAL_SIRASI, type MesajKuralSatir } from "@/types/mesajlasma";
import { kuralAlanGuncelle, testGonderAction } from "./actions";

const KANAL_ALAN = {
  sms: "sms_aktif",
  whatsapp: "whatsapp_aktif",
  mail: "mail_aktif",
} as const;

export function KuralSatiri({ kural }: { kural: MesajKuralSatir }) {
  const [yerel, setYerel] = useState(kural);
  const [isPending, startTransition] = useTransition();
  const [testDurumu, setTestDurumu] = useState<{ kanal: string; mesaj: string; basarili: boolean } | null>(null);

  function alanDegistir(alan: "sms_aktif" | "whatsapp_aktif" | "mail_aktif" | "aktif", deger: boolean) {
    setYerel((y) => ({ ...y, [alan]: deger }));
    startTransition(async () => {
      const sonuc = await kuralAlanGuncelle(kural.id, alan, deger);
      if (!sonuc.success) {
        setYerel((y) => ({ ...y, [alan]: !deger }));
      }
    });
  }

  function testGonder(kanal: (typeof KANAL_SIRASI)[number]) {
    setTestDurumu(null);
    startTransition(async () => {
      const sonuc = await testGonderAction(kural.bolum, kural.tetikleyici_kod, kanal);
      setTestDurumu({ kanal, mesaj: sonuc.message, basarili: sonuc.success });
    });
  }

  const aktifKanallar = KANAL_SIRASI.filter((k) => yerel[KANAL_ALAN[k]]);

  return (
    <tr className={cn("border-b border-border last:border-b-0", !yerel.aktif && "opacity-50")}>
      <td className="px-3 py-2.5">
        <span className="font-medium">{kural.tetikleyici_adi}</span>
        <span className="block font-mono text-[0.7rem] text-muted-foreground">{kural.tetikleyici_kod}</span>
      </td>
      {KANAL_SIRASI.map((kanal) => (
        <td key={kanal} className="px-3 py-2.5 text-center">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={yerel[KANAL_ALAN[kanal]]}
            disabled={isPending || !yerel.aktif}
            onChange={(e) => alanDegistir(KANAL_ALAN[kanal], e.target.checked)}
            aria-label={`${kural.tetikleyici_adi} — ${kanal}`}
          />
        </td>
      ))}
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          className="size-4 accent-emerald-500"
          checked={yerel.aktif}
          disabled={isPending}
          onChange={(e) => alanDegistir("aktif", e.target.checked)}
          aria-label={`${kural.tetikleyici_adi} — aktif`}
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            {aktifKanallar.length === 0 ? (
              <span className="text-xs text-muted-foreground">Kanal seçilmedi</span>
            ) : (
              aktifKanallar.map((kanal) => (
                <Button
                  key={kanal}
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={isPending || !yerel.aktif}
                  onClick={() => testGonder(kanal)}
                  aria-label={`${kanal} test gönder`}
                  title={`${kanal.toUpperCase()} — Test Gönder`}
                >
                  <Send />
                </Button>
              ))
            )}
          </div>
          {testDurumu && (
            <span
              className={cn(
                "text-right text-[0.7rem]",
                testDurumu.basarili ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}
            >
              {testDurumu.kanal.toUpperCase()}: {testDurumu.mesaj}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

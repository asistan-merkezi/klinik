"use client";

import { useId, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { KANAL_SIRASI, KANAL_ETIKET, type MesajKanal, type MesajKuralSatir } from "@/types/mesajlasma";
import { kuralAlanGuncelle, kuralMesajMetniGuncelle, testGonderAction } from "./actions";

const KANAL_ALAN = {
  sms: "sms_aktif",
  whatsapp: "whatsapp_aktif",
  mail: "mail_aktif",
} as const;

const MESAJ_METNI_MAX_UZUNLUK = 1000;

export function KuralDuzenleDialog({
  acik,
  onOpenChange,
  kural,
  onGuncelle,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  kural: MesajKuralSatir;
  onGuncelle: (kural: MesajKuralSatir) => void;
}) {
  const idOnEki = useId();
  const [isPending, startTransition] = useTransition();
  const [mesajMetni, setMesajMetni] = useState(kural.mesaj_metni);
  const [metinKaydediliyor, setMetinKaydediliyor] = useState(false);
  const [testDurumu, setTestDurumu] = useState<{ kanal: MesajKanal; mesaj: string; basarili: boolean } | null>(null);

  function alanDegistir(alan: "sms_aktif" | "whatsapp_aktif" | "mail_aktif" | "aktif", deger: boolean) {
    const onceki = kural;
    onGuncelle({ ...kural, [alan]: deger });
    startTransition(async () => {
      const sonuc = await kuralAlanGuncelle(kural.id, alan, deger);
      if (!sonuc.success) onGuncelle(onceki);
    });
  }

  function mesajMetniKaydet() {
    setMetinKaydediliyor(true);
    startTransition(async () => {
      const sonuc = await kuralMesajMetniGuncelle(kural.id, mesajMetni);
      setMetinKaydediliyor(false);
      if (sonuc.success) {
        const kaydedilenMetin = mesajMetni.trim();
        setMesajMetni(kaydedilenMetin);
        onGuncelle({ ...kural, mesaj_metni: kaydedilenMetin });
      }
    });
  }

  function testGonder(kanal: MesajKanal) {
    setTestDurumu(null);
    startTransition(async () => {
      const sonuc = await testGonderAction(kural.bolum, kural.tetikleyici_kod, kanal);
      setTestDurumu({ kanal, mesaj: sonuc.message, basarili: sonuc.success });
    });
  }

  const aktifKanallar = KANAL_SIRASI.filter((k) => kural[KANAL_ALAN[k]]);
  const metinDegisti = mesajMetni.trim() !== kural.mesaj_metni;

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kural.tetikleyici_adi}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <span className="font-mono text-[0.7rem] text-muted-foreground">{kural.tetikleyici_kod}</span>

          <div className="flex items-center gap-2">
            <input
              id={`${idOnEki}-aktif`}
              type="checkbox"
              className="size-4 accent-emerald-500"
              checked={kural.aktif}
              disabled={isPending}
              onChange={(e) => alanDegistir("aktif", e.target.checked)}
            />
            <Label htmlFor={`${idOnEki}-aktif`} className="font-normal">
              Bu kural aktif
            </Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Gönderim Kanalları</Label>
            <div className="flex flex-wrap gap-4">
              {KANAL_SIRASI.map((kanal) => (
                <label key={kanal} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={kural[KANAL_ALAN[kanal]]}
                    disabled={isPending || !kural.aktif}
                    onChange={(e) => alanDegistir(KANAL_ALAN[kanal], e.target.checked)}
                  />
                  {KANAL_ETIKET[kanal]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idOnEki}-metin`}>Mesaj Metni</Label>
            <textarea
              id={`${idOnEki}-metin`}
              rows={4}
              maxLength={MESAJ_METNI_MAX_UZUNLUK}
              value={mesajMetni}
              onChange={(e) => setMesajMetni(e.target.value)}
              placeholder="Bu tetikleyicide gönderilecek mesaj metnini yazın..."
              disabled={isPending}
              className="w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {mesajMetni.length}/{MESAJ_METNI_MAX_UZUNLUK}
              </span>
              <Button type="button" size="sm" disabled={isPending || !metinDegisti} onClick={mesajMetniKaydet}>
                {metinKaydediliyor ? "Kaydediliyor..." : "Metni Kaydet"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <Label>Test Gönder</Label>
            {!kural.aktif || aktifKanallar.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Test göndermek için önce kuralı ve en az bir kanalı aktif edin.
              </span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {aktifKanallar.map((kanal) => (
                  <Button
                    key={kanal}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => testGonder(kanal)}
                  >
                    <Send className="size-3.5" aria-hidden />
                    {KANAL_ETIKET[kanal]}
                  </Button>
                ))}
              </div>
            )}
            {testDurumu && (
              <span
                className={cn(
                  "text-xs",
                  testDurumu.basarili ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}
              >
                {KANAL_ETIKET[testDurumu.kanal]}: {testDurumu.mesaj}
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

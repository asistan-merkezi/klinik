"use client";

import { useId, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { KANAL_SIRASI, KANAL_ETIKET, type MesajKanal, type MesajKuralSatir } from "@/types/mesajlasma";
import { kuralGuncelle, testGonderAction } from "./actions";

const KANAL_ALAN = {
  sms: "sms_aktif",
  whatsapp: "whatsapp_aktif",
  mail: "mail_aktif",
} as const;

const MESAJ_METNI_MAX_UZUNLUK = 1000;

type Taslak = {
  aktif: boolean;
  sms_aktif: boolean;
  whatsapp_aktif: boolean;
  mail_aktif: boolean;
  mesaj_metni: string;
};

function taslakOlustur(kural: MesajKuralSatir): Taslak {
  return {
    aktif: kural.aktif,
    sms_aktif: kural.sms_aktif,
    whatsapp_aktif: kural.whatsapp_aktif,
    mail_aktif: kural.mail_aktif,
    mesaj_metni: kural.mesaj_metni,
  };
}

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
  const [taslak, setTaslak] = useState<Taslak>(() => taslakOlustur(kural));
  const [hataMesaji, setHataMesaji] = useState<string | null>(null);
  const [testDurumu, setTestDurumu] = useState<{ kanal: MesajKanal; mesaj: string; basarili: boolean } | null>(null);
  const [sonAcik, setSonAcik] = useState(acik);

  // Dialog her açıldığında taslağı en güncel kaydedilmiş duruma sıfırla —
  // önceki açılıştan kalan kaydedilmemiş bir taslak yanlışlıkla kalmasın.
  // useEffect yerine render sırasında state ayarlama (React'in "adjusting
  // state when a prop changes" deseni) kullanılıyor — bakiye-hareket-satiri.tsx
  // içindeki BorcDuzenleDialog'daki aynı desen, react-hooks/set-state-in-effect
  // kuralına takılmıyor.
  if (acik !== sonAcik) {
    setSonAcik(acik);
    if (acik) {
      setTaslak(taslakOlustur(kural));
      setHataMesaji(null);
      setTestDurumu(null);
    }
  }

  function alanDegistir<K extends keyof Taslak>(alan: K, deger: Taslak[K]) {
    setTaslak((t) => ({ ...t, [alan]: deger }));
  }

  const degisiklikVar =
    taslak.aktif !== kural.aktif ||
    taslak.sms_aktif !== kural.sms_aktif ||
    taslak.whatsapp_aktif !== kural.whatsapp_aktif ||
    taslak.mail_aktif !== kural.mail_aktif ||
    taslak.mesaj_metni.trim() !== kural.mesaj_metni;

  function degisiklikleriKaydet() {
    setHataMesaji(null);
    startTransition(async () => {
      const sonuc = await kuralGuncelle(kural.id, taslak);
      if (!sonuc.success) {
        setHataMesaji(sonuc.message);
        return;
      }
      const kaydedilen: MesajKuralSatir = { ...kural, ...taslak, mesaj_metni: taslak.mesaj_metni.trim() };
      setTaslak(taslakOlustur(kaydedilen));
      onGuncelle(kaydedilen);
    });
  }

  function testGonder(kanal: MesajKanal) {
    setTestDurumu(null);
    startTransition(async () => {
      const sonuc = await testGonderAction(kural.bolum, kural.tetikleyici_kod, kanal);
      setTestDurumu({ kanal, mesaj: sonuc.message, basarili: sonuc.success });
    });
  }

  // Test Gönder gerçekte DB'deki KAYDEDİLMİŞ kuralı çalıştırıyor — taslak
  // değil `kural` (props) baz alınıyor, kaydedilmemiş bir kanal seçimiyle
  // yanıltıcı bir test sonucu üretilmesin.
  const kaydedilmisAktifKanallar = KANAL_SIRASI.filter((k) => kural[KANAL_ALAN[k]]);

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
              checked={taslak.aktif}
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
                    checked={taslak[KANAL_ALAN[kanal]]}
                    disabled={isPending || !taslak.aktif}
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
              value={taslak.mesaj_metni}
              onChange={(e) => alanDegistir("mesaj_metni", e.target.value)}
              placeholder="Bu tetikleyicide gönderilecek mesaj metnini yazın..."
              disabled={isPending}
              className="w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
            />
            <span className="text-xs text-muted-foreground">
              {taslak.mesaj_metni.length}/{MESAJ_METNI_MAX_UZUNLUK}
            </span>
          </div>

          {hataMesaji && (
            <p role="alert" className="text-sm text-destructive">
              {hataMesaji}
            </p>
          )}

          <Button type="button" disabled={isPending || !degisiklikVar} onClick={degisiklikleriKaydet}>
            {isPending ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
          </Button>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <Label>Test Gönder</Label>
            {degisiklikVar && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Kaydedilmemiş değişiklikleriniz var — test, kaydedilmiş son duruma göre gönderilir.
              </span>
            )}
            {!kural.aktif || kaydedilmisAktifKanallar.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Test göndermek için önce kuralı ve en az bir kanalı aktif edip kaydedin.
              </span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {kaydedilmisAktifKanallar.map((kanal) => (
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

"use client";

import { useId, useState, useTransition } from "react";
import { Plus, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { KANAL_SIRASI, KANAL_ETIKET, type MesajKanal, type EtkinMesajKurali } from "@/types/mesajlasma";
import { tetikleyiciGetir } from "@/lib/mesaj/tetikleyiciler";
import { bilinmeyenDegiskenleriBul } from "@/lib/mesaj/degisken-dogrula";
import { kuralGuncelle, testGonder } from "./actions";

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

function taslakOlustur(kural: EtkinMesajKurali): Taslak {
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
  kural: EtkinMesajKurali;
  onGuncelle: (kural: EtkinMesajKurali) => void;
}) {
  const idOnEki = useId();
  const [isPending, startTransition] = useTransition();
  const [isTestPending, startTestTransition] = useTransition();
  const herhangiBirIslemVar = isPending || isTestPending;
  const [taslak, setTaslak] = useState<Taslak>(() => taslakOlustur(kural));
  const [hataMesaji, setHataMesaji] = useState<string | null>(null);
  const [sonAcik, setSonAcik] = useState(acik);
  const [testDurumu, setTestDurumu] = useState<{ kanal: MesajKanal; mesaj: string; basarili: boolean } | null>(null);

  const tanim = tetikleyiciGetir(kural.tetikleyici_kodu);
  const gecerliDegiskenler = tanim?.gecerliDegiskenler ?? [];

  // Dialog her açıldığında taslağı en güncel kaydedilmiş duruma sıfırla —
  // render sırasında state ayarlama (React'in "adjusting state when a prop
  // changes" deseni), useEffect DEĞİL — bakiye-hareket-satiri.tsx içindeki
  // BorcDuzenleDialog'daki aynı desen, react-hooks/set-state-in-effect
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

  function degiskenEkle(degisken: string) {
    setTaslak((t) => ({
      ...t,
      mesaj_metni: `${t.mesaj_metni}${t.mesaj_metni && !t.mesaj_metni.endsWith(" ") ? " " : ""}{{${degisken}}}`,
    }));
  }

  const bilinmeyenDegiskenler = bilinmeyenDegiskenleriBul(taslak.mesaj_metni, gecerliDegiskenler);

  const degisiklikVar =
    taslak.aktif !== kural.aktif ||
    taslak.sms_aktif !== kural.sms_aktif ||
    taslak.whatsapp_aktif !== kural.whatsapp_aktif ||
    taslak.mail_aktif !== kural.mail_aktif ||
    taslak.mesaj_metni.trim() !== kural.mesaj_metni;

  function degisiklikleriKaydet() {
    setHataMesaji(null);
    startTransition(async () => {
      const sonuc = await kuralGuncelle(kural.tetikleyici_kodu, taslak);
      if (!sonuc.success) {
        setHataMesaji(sonuc.message);
        return;
      }
      const kaydedilen: EtkinMesajKurali = { ...kural, ...taslak, mesaj_metni: taslak.mesaj_metni.trim() };
      setTaslak(taslakOlustur(kaydedilen));
      onGuncelle(kaydedilen);
    });
  }

  function testGonderTikla(kanal: MesajKanal) {
    setTestDurumu(null);
    startTestTransition(async () => {
      const sonuc = await testGonder(kural.tetikleyici_kodu, kanal);
      setTestDurumu({ kanal, mesaj: sonuc.message, basarili: sonuc.success });
    });
  }

  // Test Gönder, DB'deki KAYDEDİLMİŞ (props) kural durumunu kullanır —
  // taslaktaki kaydedilmemiş değişiklikler test sonucunu yanıltmasın.
  const kaydedilmisAktifKanallar = KANAL_SIRASI.filter((k) => kural[KANAL_ALAN[k]]);

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kural.tetikleyici_adi}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <span className="font-mono text-[0.7rem] text-muted-foreground">{kural.tetikleyici_kodu}</span>

          <div className="flex items-center gap-2">
            <input
              id={`${idOnEki}-aktif`}
              type="checkbox"
              className="size-4 accent-emerald-500"
              checked={taslak.aktif}
              disabled={herhangiBirIslemVar}
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
                    disabled={herhangiBirIslemVar || !taslak.aktif}
                    onChange={(e) => alanDegistir(KANAL_ALAN[kanal], e.target.checked)}
                  />
                  {KANAL_ETIKET[kanal]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idOnEki}-metin`}>Mesaj Metni</Label>
            {gecerliDegiskenler.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Değişken ekle:</span>
                {gecerliDegiskenler.map((degisken) => (
                  <button
                    key={degisken}
                    type="button"
                    disabled={herhangiBirIslemVar}
                    onClick={() => degiskenEkle(degisken)}
                    className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Plus className="size-2.5" aria-hidden />
                    {`{{${degisken}}}`}
                  </button>
                ))}
              </div>
            )}
            <textarea
              id={`${idOnEki}-metin`}
              rows={4}
              maxLength={MESAJ_METNI_MAX_UZUNLUK}
              value={taslak.mesaj_metni}
              onChange={(e) => alanDegistir("mesaj_metni", e.target.value)}
              placeholder="Bu tetikleyicide gönderilecek mesaj metnini yazın..."
              disabled={herhangiBirIslemVar}
              className="w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {taslak.mesaj_metni.length}/{MESAJ_METNI_MAX_UZUNLUK}
              </span>
            </div>
            {bilinmeyenDegiskenler.length > 0 && (
              <p role="alert" className="text-xs text-destructive">
                Bilinmeyen değişken(ler): {bilinmeyenDegiskenler.map((d) => `{{${d}}}`).join(", ")} — sadece yukarıdaki
                listedeki değişkenler kullanılabilir.
              </p>
            )}
          </div>

          {hataMesaji && (
            <p role="alert" className="text-sm text-destructive">
              {hataMesaji}
            </p>
          )}

          <Button
            type="button"
            disabled={herhangiBirIslemVar || !degisiklikVar || bilinmeyenDegiskenler.length > 0}
            onClick={degisiklikleriKaydet}
          >
            {isPending ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
          </Button>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <Label>Test Gönder</Label>
            <span className="text-xs text-muted-foreground">
              Kendi telefonunuza/e-postanıza gönderilir, gerçekten 1 kredi düşer (şu an simülasyon modunda — sunucu
              loguna yazılır, gerçek bir sağlayıcıya gitmez).
            </span>
            {degisiklikVar && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Kaydedilmemiş değişiklikleriniz var — test, en son kaydedilmiş duruma göre gönderilir.
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
                    disabled={herhangiBirIslemVar}
                    onClick={() => testGonderTikla(kanal)}
                  >
                    <Send className="size-3.5" aria-hidden />
                    {isTestPending ? "Gönderiliyor..." : KANAL_ETIKET[kanal]}
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

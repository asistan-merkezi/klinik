"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { gecIptalMi, GEC_IPTAL_UYARISI } from "@/lib/randevu/gec-iptal";
import { iptalTalebiOlustur } from "./actions";

/**
 * Hasta iptal talebi: tıklanınca açıklama alanı açılır; randevuya 18 saatten az
 * kaldıysa "seansınız sayılacaktır" uyarısı, zorunlu açıklama ve "Emin misiniz?"
 * onayı çıkar (panelle aynı kural, bkz. lib/randevu/gec-iptal.ts).
 */
export function IptalTalepButonu({ randevuId, baslangic }: { randevuId: string; baslangic: string }) {
  const [pending, startTransition] = useTransition();
  const [sonuc, setSonuc] = useState<{ success: boolean; message: string } | null>(null);
  const [acik, setAcik] = useState(false);
  const [onayBekliyor, setOnayBekliyor] = useState(false);
  const [aciklama, setAciklama] = useState("");
  const [gec] = useState(() => gecIptalMi(baslangic));

  if (sonuc?.success) {
    return <p className="text-xs text-emerald-600 dark:text-emerald-400">{sonuc.message}</p>;
  }

  function gonder() {
    startTransition(async () => {
      const r = await iptalTalebiOlustur(randevuId, aciklama);
      setSonuc(r);
      setOnayBekliyor(false);
    });
  }

  if (!acik) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAcik(true)}>
        İptal talep et
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:max-w-sm">
      {gec && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400">
          {GEC_IPTAL_UYARISI}
        </p>
      )}
      <Label htmlFor={`iptal_aciklama_${randevuId}`} className="text-xs">
        Açıklama{gec ? "" : " (opsiyonel)"}
      </Label>
      <textarea
        id={`iptal_aciklama_${randevuId}`}
        value={aciklama}
        onChange={(e) => setAciklama(e.target.value)}
        rows={2}
        maxLength={1000}
        disabled={pending}
        placeholder="İptal sebebinizi yazın..."
        className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      {onayBekliyor ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium">Seansınız sayılacaktır. Emin misiniz?</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={gonder}>
              {pending ? "Gönderiliyor..." : "Evet, talep et"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setOnayBekliyor(false)}>
              Vazgeç
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || (gec && !aciklama.trim())}
            onClick={() => (gec ? setOnayBekliyor(true) : gonder())}
          >
            {pending ? "Gönderiliyor..." : "Talebi Gönder"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setAcik(false)}>
            Vazgeç
          </Button>
        </div>
      )}
      {sonuc && !sonuc.success && <p className="text-xs text-destructive">{sonuc.message}</p>}
    </div>
  );
}

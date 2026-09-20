"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ModulAgaci } from "@/components/panel/modul-agaci";
import type { Pozisyon } from "@/types/pozisyon";
import { pozisyonIzinleriGuncelle } from "./actions";

export function PozisyonIzinDialog({
  pozisyon,
  duzenlenebilir,
}: {
  pozisyon: Pozisyon;
  duzenlenebilir: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const [secili, setSecili] = useState<string[]>(pozisyon.allowed_modules ?? []);
  const [pending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);

  // Klinik Yöneticisi rolündeki pozisyonlar zaten "*" ile tam erişir —
  // self-escalation kaygısıyla tutarlı, ağaç burada da düzenlenemez.
  const tamYetkili = pozisyon.varsayilan_rol === "klinik_admin";

  function kaydet() {
    setHata(null);
    startTransition(async () => {
      const sonuc = await pozisyonIzinleriGuncelle(pozisyon.id, secili);
      if (sonuc && !sonuc.success) {
        setHata(sonuc.message);
        return;
      }
      setAcik(false);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={!duzenlenebilir} onClick={() => setAcik(true)}>
        <ShieldCheck /> İzinleri Düzenle
      </Button>

      <Dialog open={acik} onOpenChange={setAcik}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pozisyon.ad} — Modül İzinleri</DialogTitle>
          </DialogHeader>

          {tamYetkili ? (
            <p className="text-sm text-muted-foreground">
              Bu pozisyon Klinik Yöneticisi rolünde — tüm modüllere her zaman erişir, ayrıca ayarlanamaz.
            </p>
          ) : (
            <ModulAgaci value={secili} onValueChange={setSecili} disabled={pending} />
          )}

          {hata && <p className="text-xs text-destructive">{hata}</p>}

          {!tamYetkili && (
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setAcik(false)}>
                Vazgeç
              </Button>
              <Button type="button" disabled={pending} onClick={kaydet}>
                {pending ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

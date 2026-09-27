"use client";

import { useState, useTransition } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import type { Pozisyon } from "@/types/pozisyon";
import { PersonelFormu } from "../../personel/personel-formu";
import { pozisyonAktifDurumDegistir, pozisyonSistemErisimiDegistir } from "./actions";

function IkiliSwitch({
  baslik,
  soldakiEtiket,
  sagdakiEtiket,
  checked,
  disabled,
  onCheckedChange,
}: {
  baslik: string;
  soldakiEtiket: string;
  sagdakiEtiket: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{baslik}</span>
      <div className="flex items-center gap-2 text-xs">
        <span className={cn(!checked ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
          {soldakiEtiket}
        </span>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
        <span className={cn(checked ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
          {sagdakiEtiket}
        </span>
      </div>
    </div>
  );
}

export function PozisyonSatiri({
  pozisyon,
  duzenlenebilir,
  calisaniVarMi,
  aktifPozisyonlar,
}: {
  pozisyon: Pozisyon;
  duzenlenebilir: boolean;
  calisaniVarMi: boolean;
  aktifPozisyonlar: Pozisyon[];
}) {
  const [aktifPending, startAktifTransition] = useTransition();
  const [aktifHata, setAktifHata] = useState<string | null>(null);
  const [erisimPending, startErisimTransition] = useTransition();
  const [erisimHata, setErisimHata] = useState<string | null>(null);
  const [denemeDialogAcik, setDenemeDialogAcik] = useState(false);

  // Aktif ama o unvanda henüz çalışanı olmayan pozisyonlarda, gerçek bir Personel
  // Ekle akışı (İş Başvurusu onayına gerek kalmadan) kısayolu gösterilir — sadece
  // klinik_admin, gerçek bir personel/kullanıcı kaydı açar (sahte veri üretmez).
  const denemeIcinOlusturGoster = duzenlenebilir && pozisyon.aktif && !calisaniVarMi;

  return (
    <li className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-medium ${pozisyon.aktif ? "" : "text-muted-foreground line-through"}`}>
          {pozisyon.ad}
        </span>
        {pozisyon.ozel_mi && <StatusBadge tone="sky">Özel</StatusBadge>}
        {denemeIcinOlusturGoster && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setDenemeDialogAcik(true)}>
              <FlaskConical /> Deneme İçin Oluştur
            </Button>
            <Dialog open={denemeDialogAcik} onOpenChange={setDenemeDialogAcik}>
              <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Personel Ekle — {pozisyon.ad}</DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">
                  Bu pozisyonda henüz çalışan yok — deneme/test amacıyla gerçek bir personel ve giriş
                  hesabı oluşturmak için formu doldurun.
                </p>
                <PersonelFormu mod="olustur" pozisyonlar={aktifPozisyonlar} varsayilanPozisyonId={pozisyon.id} />
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center gap-4">
          <IkiliSwitch
            baslik="Durum"
            soldakiEtiket="Pasif"
            sagdakiEtiket="Aktif"
            checked={pozisyon.aktif}
            disabled={!duzenlenebilir || aktifPending}
            onCheckedChange={(deger) =>
              startAktifTransition(async () => {
                setAktifHata(null);
                const sonuc = await pozisyonAktifDurumDegistir(pozisyon.id, deger);
                if (sonuc && !sonuc.success) {
                  setAktifHata(sonuc.message);
                }
              })
            }
          />
          <IkiliSwitch
            baslik="Sistem Erişimi"
            soldakiEtiket="Yok"
            sagdakiEtiket="Var"
            checked={pozisyon.sistem_erisimi}
            disabled={!duzenlenebilir || erisimPending}
            onCheckedChange={(deger) =>
              startErisimTransition(async () => {
                setErisimHata(null);
                const sonuc = await pozisyonSistemErisimiDegistir(pozisyon.id, deger);
                if (sonuc && !sonuc.success) {
                  setErisimHata(sonuc.message);
                }
              })
            }
          />
        </div>
        {aktifHata && <p className="text-xs text-destructive">{aktifHata}</p>}
        {erisimHata && <p className="text-xs text-destructive">{erisimHata}</p>}
      </div>
    </li>
  );
}

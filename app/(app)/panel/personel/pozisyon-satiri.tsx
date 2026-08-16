"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { ROL_SECENEKLERI } from "@/types/personel";
import { UCRET_TIPI_SECENEKLERI, PUANTAJ_MODU_SECENEKLERI, type Pozisyon } from "@/types/pozisyon";
import { pozisyonGuncelle, pozisyonAktifDurumDegistir } from "./actions";

export function PozisyonSatiri({
  pozisyon,
  personelSayisi,
  duzenleniyor,
  onDuzenleBaslat,
  onDuzenleBitir,
}: {
  pozisyon: Pozisyon;
  personelSayisi: number;
  duzenleniyor: boolean;
  onDuzenleBaslat: () => void;
  onDuzenleBitir: () => void;
}) {
  const guncelleAction = pozisyonGuncelle.bind(null, pozisyon.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [aktifPending, startAktifTransition] = useTransition();
  const [aktifHata, setAktifHata] = useState<string | null>(null);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      onDuzenleBitir();
    }
  }

  if (duzenleniyor) {
    return (
      <li className="py-3">
        <form action={formAction} className="flex flex-col gap-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`grup-${pozisyon.id}`}>Grup</Label>
              <Input id={`grup-${pozisyon.id}`} name="grup" defaultValue={pozisyon.grup} required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`sira-${pozisyon.id}`}>Sıra</Label>
              <Input id={`sira-${pozisyon.id}`} name="sira" type="number" defaultValue={pozisyon.sira} disabled={isPending} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`rol-${pozisyon.id}`}>Varsayılan Rol</Label>
              <Select
                name="varsayilan_rol"
                disabled={isPending}
                defaultValue={pozisyon.varsayilan_rol}
                items={ROL_SECENEKLERI}
              >
                <SelectTrigger id={`rol-${pozisyon.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROL_SECENEKLERI.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`ucret-${pozisyon.id}`}>Ücret Tipi</Label>
              <Select
                name="ucret_tipi"
                disabled={isPending}
                defaultValue={pozisyon.ucret_tipi}
                items={UCRET_TIPI_SECENEKLERI}
              >
                <SelectTrigger id={`ucret-${pozisyon.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UCRET_TIPI_SECENEKLERI.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`puantaj-${pozisyon.id}`}>Puantaj Modu</Label>
              <Select
                name="puantaj_modu"
                disabled={isPending}
                defaultValue={pozisyon.puantaj_modu}
                items={PUANTAJ_MODU_SECENEKLERI}
              >
                <SelectTrigger id={`puantaj-${pozisyon.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PUANTAJ_MODU_SECENEKLERI.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id={`erisim-${pozisyon.id}`}
                name="sistem_erisimi"
                type="checkbox"
                defaultChecked={pozisyon.sistem_erisimi}
                disabled={isPending}
                className="size-4 rounded border-input"
              />
              <Label htmlFor={`erisim-${pozisyon.id}`} className="cursor-pointer font-normal">
                Sistem erişimi (login hesabı) var
              </Label>
            </div>
          </div>

          {durum && (
            <p role="alert" className={durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
              {durum.message}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onDuzenleBitir}>
              Vazgeç
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${pozisyon.aktif ? "" : "text-muted-foreground line-through"}`}>
            {pozisyon.ad}
          </span>
          {pozisyon.ozel_mi && <StatusBadge tone="sky">Özel</StatusBadge>}
          {!pozisyon.aktif && <StatusBadge tone="rose">Pasif</StatusBadge>}
          {personelSayisi > 0 && (
            <span className="text-xs text-muted-foreground">
              {personelSayisi} personel
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {ROL_SECENEKLERI.find((r) => r.value === pozisyon.varsayilan_rol)?.label} ·{" "}
          {UCRET_TIPI_SECENEKLERI.find((s) => s.value === pozisyon.ucret_tipi)?.label} ·{" "}
          {PUANTAJ_MODU_SECENEKLERI.find((s) => s.value === pozisyon.puantaj_modu)?.label}
          {pozisyon.sistem_erisimi ? " · Sistem erişimi var" : " · Sistem erişimi yok"}
        </span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={aktifPending}
            onClick={() =>
              startAktifTransition(async () => {
                setAktifHata(null);
                const sonuc = await pozisyonAktifDurumDegistir(pozisyon.id, !pozisyon.aktif);
                if (sonuc && !sonuc.success) {
                  setAktifHata(sonuc.message);
                }
              })
            }
          >
            {pozisyon.aktif ? "Pasife al" : "Aktifleştir"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDuzenleBaslat}>
            Düzenle
          </Button>
        </div>
        {aktifHata && <p className="text-xs text-destructive">{aktifHata}</p>}
      </div>
    </li>
  );
}

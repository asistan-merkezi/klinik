"use client";

import { useActionState, useState, useTransition } from "react";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HAFTANIN_GUNLERI, GUN_ETIKETI } from "@/types/periyodik-randevu";
import type { PeriyodikRandevuSatir } from "@/types/periyodik-randevu";
import {
  periyodikRandevuIptalEt,
  periyodikRandevuGuncelle,
  periyodikRandevuYenilenmeyecek,
} from "../../randevular/actions";

function saatKisalt(saat: string) {
  return saat.slice(0, 5);
}

function tarihEtiketi(tarih: string) {
  return new Date(`${tarih}T00:00:00Z`).toLocaleDateString("tr-TR");
}

function gunKalanHesapla(bitisTarihi: string) {
  const simdi = Date.now();
  const bitis = new Date(`${bitisTarihi}T00:00:00Z`).getTime();
  return Math.ceil((bitis - simdi) / 86_400_000);
}

function PeriyodikSatir({ hastaId, periyodik }: { hastaId: string; periyodik: PeriyodikRandevuSatir }) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [uzatVarsayilan, setUzatVarsayilan] = useState(false);
  const guncelleAction = periyodikRandevuGuncelle.bind(null, periyodik.id, hastaId);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);
  const [iptalPending, startIptalTransition] = useTransition();
  const [yenilenmeyecekPending, startYenilenmeyecekTransition] = useTransition();

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setDuzenleniyor(false);
    }
  }

  const gunKalan = periyodik.bitis_tarihi ? gunKalanHesapla(periyodik.bitis_tarihi) : null;
  const uyariGoster = periyodik.otomatik_yenile && gunKalan !== null && gunKalan <= 14;

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-medium">
            Her {GUN_ETIKETI[periyodik.haftanin_gunu]} {saatKisalt(periyodik.saat)}
          </span>
          <span className="text-muted-foreground">
            {periyodik.islem_tanimi?.ad ?? "—"} · {periyodik.terapist?.personel?.ad_soyad ?? "—"} ·{" "}
            {periyodik.oda?.ad ?? "—"}
          </span>
          {periyodik.bitis_tarihi && (
            <span className="text-xs text-muted-foreground">
              {tarihEtiketi(periyodik.bitis_tarihi)} tarihinde sona erecek
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setUzatVarsayilan(false);
              setDuzenleniyor((v) => !v);
            }}
          >
            Düzenle
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={iptalPending}
            onClick={() =>
              startIptalTransition(() => {
                void periyodikRandevuIptalEt(periyodik.id, hastaId);
              })
            }
          >
            İptal et
          </Button>
        </div>
      </div>

      {uyariGoster && gunKalan !== null && periyodik.bitis_tarihi && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <span>
            Bu periyodik randevunun süresi{" "}
            {gunKalan <= 0 ? "doldu" : `${gunKalan} gün sonra doluyor`} ({tarihEtiketi(periyodik.bitis_tarihi)}).
            Devam etsin mi, bitsin mi?
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setUzatVarsayilan(true);
                setDuzenleniyor(true);
              }}
            >
              Devam etsin (5 ay uzat)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={yenilenmeyecekPending}
              onClick={() =>
                startYenilenmeyecekTransition(() => {
                  void periyodikRandevuYenilenmeyecek(periyodik.id, hastaId);
                })
              }
            >
              Bitsin (yenilenmeyecek)
            </Button>
          </div>
        </div>
      )}

      {duzenleniyor && (
        <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`gun-${periyodik.id}`}>Haftanın Günü</Label>
              <Select
                name="haftanin_gunu"
                required
                disabled={isPending}
                defaultValue={String(periyodik.haftanin_gunu)}
                items={HAFTANIN_GUNLERI}
              >
                <SelectTrigger id={`gun-${periyodik.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HAFTANIN_GUNLERI.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`saat-${periyodik.id}`}>Saat</Label>
              <Input
                id={`saat-${periyodik.id}`}
                name="saat"
                type="time"
                defaultValue={saatKisalt(periyodik.saat)}
                required
                disabled={isPending}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`uzat-${periyodik.id}`}
              name="uzat"
              type="checkbox"
              defaultChecked={uzatVarsayilan}
              disabled={isPending}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor={`uzat-${periyodik.id}`} className="font-normal">
              Süreyi bugünden itibaren 5 ay uzat
            </Label>
          </div>

          {durum && (
            <div className="flex flex-col gap-2">
              <p role="alert" className={durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                {durum.message}
              </p>
              {durum.cakismalar && durum.cakismalar.length > 0 && (
                <ul className="flex flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
                  {durum.cakismalar.map((c) => (
                    <li key={c.tarihEtiketi} className="flex items-center justify-between gap-2">
                      <span>{c.tarihEtiketi}</span>
                      <a
                        href={c.whatsappLink}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-emerald-700 underline dark:text-emerald-400"
                      >
                        WhatsApp'tan Gönder
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setDuzenleniyor(false)}
            >
              Vazgeç
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function PeriyodikRandevularKarti({
  hastaId,
  periyodikRandevular,
}: {
  hastaId: string;
  periyodikRandevular: PeriyodikRandevuSatir[];
}) {
  if (periyodikRandevular.length === 0) {
    return <EmptyState icon={Repeat} title="Aktif periyodik randevu yok." />;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {periyodikRandevular.map((p) => (
        <PeriyodikSatir key={p.id} hastaId={hastaId} periyodik={p} />
      ))}
    </ul>
  );
}

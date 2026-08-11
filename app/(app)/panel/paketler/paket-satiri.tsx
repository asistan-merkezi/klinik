"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, isimBasHarfBuyukYap } from "@/lib/utils";
import { satisSuresiDoldu, satisEngelliMi, paketArsivdeMi } from "@/lib/paket/satis-suresi";
import type { SecenekSatir } from "@/types/randevu";
import type { PaketSatir, SatisHastaSecenegi } from "@/types/paket";
import { paketAktifDurumDegistir, paketGuncelle, paketTekrarla } from "./actions";
import { PaketSatisDialog } from "./paket-satis-dialog";
import { PaketKatilimcilarDialog } from "./paket-katilimcilar-dialog";

const SATIS_SINIFI =
  "!border-emerald-500/30 !bg-emerald-500/10 !text-emerald-700 hover:!bg-emerald-500/20 dark:!border-emerald-500/30 dark:!text-emerald-400 dark:hover:!bg-emerald-500/20";
const PASIF_SINIFI =
  "!border-amber-500/30 !bg-amber-500/10 !text-amber-700 hover:!bg-amber-500/20 dark:!border-amber-500/30 dark:!text-amber-400 dark:hover:!bg-amber-500/20";
const DUZENLE_SINIFI =
  "!border-sky-500/30 !bg-sky-500/10 !text-sky-700 hover:!bg-sky-500/20 dark:!border-sky-500/30 dark:!text-sky-400 dark:hover:!bg-sky-500/20";
const TEKRARLA_SINIFI =
  "!border-violet-500/30 !bg-violet-500/10 !text-violet-700 hover:!bg-violet-500/20 dark:!border-violet-500/30 dark:!text-violet-400 dark:hover:!bg-violet-500/20";

export function PaketSatiri({
  paket,
  islemTanimlari,
  duzenlenebilir,
  satisYapabilir,
  hastalar,
  gecikme,
}: {
  paket: PaketSatir;
  islemTanimlari: SecenekSatir[];
  duzenlenebilir: boolean;
  satisYapabilir: boolean;
  hastalar: SatisHastaSecenegi[];
  gecikme?: number;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [duzenleForm, setDuzenleForm] = useState(paket);
  const [adMetni, setAdMetni] = useState(paket.ad);
  const guncelleAction = paketGuncelle.bind(null, paket.id);
  const [durum, formAction, isPending] = useActionState(guncelleAction, null);
  const [aktifPending, startAktifTransition] = useTransition();
  const [tekrarPending, startTekrarTransition] = useTransition();
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) {
      setDuzenleniyor(false);
    }
  }

  const arsivde = paketArsivdeMi(paket);

  if (duzenleniyor) {
    return (
      <li className="animate-kart-giris" style={gecikme != null ? { animationDelay: `${gecikme}ms` } : undefined}>
        <Card className="p-3">
          <form action={formAction} className="flex flex-col gap-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`ad-${paket.id}`}>Paket Adı</Label>
                <Input
                  id={`ad-${paket.id}`}
                  name="ad"
                  value={adMetni}
                  onChange={(e) => setAdMetni(isimBasHarfBuyukYap(e.target.value))}
                  required
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`islem-${paket.id}`}>İşlem</Label>
                <Select
                  name="islem_tanimi_id"
                  required
                  disabled={isPending}
                  defaultValue={islemTanimlari.find((i) => i.ad === duzenleForm.islem_tanimi?.ad)?.id}
                  items={islemTanimlari.map((i) => ({ value: i.id, label: i.ad }))}
                >
                  <SelectTrigger id={`islem-${paket.id}`} className="w-full">
                    <SelectValue placeholder="İşlem seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {islemTanimlari.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.ad}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`seans-${paket.id}`}>Seans Sayısı</Label>
                <Input
                  id={`seans-${paket.id}`}
                  name="seans_sayisi"
                  type="number"
                  min={1}
                  step="1"
                  defaultValue={duzenleForm.seans_sayisi}
                  required
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`satis-bitis-${paket.id}`}>Paket Bitiş Tarihi</Label>
                <Input
                  id={`satis-bitis-${paket.id}`}
                  name="satis_bitis_tarihi"
                  type="date"
                  defaultValue={duzenleForm.satis_bitis_tarihi ?? ""}
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`fiyat-${paket.id}`}>Fiyat (₺)</Label>
                <Input
                  id={`fiyat-${paket.id}`}
                  name="fiyat"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={duzenleForm.fiyat}
                  required
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`kdv-${paket.id}`}>KDV (%)</Label>
                <Input
                  id={`kdv-${paket.id}`}
                  name="kdv_orani"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={duzenleForm.kdv_orani}
                  required
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`kota-${paket.id}`}>Kişi Kotası</Label>
                <Input
                  id={`kota-${paket.id}`}
                  name="kisi_kotasi"
                  type="number"
                  min={1}
                  step="1"
                  defaultValue={duzenleForm.kisi_kotasi ?? ""}
                  disabled={isPending}
                />
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
        </Card>
      </li>
    );
  }

  return (
    <li className="animate-kart-giris" style={gecikme != null ? { animationDelay: `${gecikme}ms` } : undefined}>
      <Card className="flex-col gap-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className={cn("font-medium", !paket.aktif && "text-muted-foreground line-through")}>
              {paket.ad}
            </span>
            <span className="text-sm text-muted-foreground">
              {paket.islem_tanimi?.ad ?? "—"} · {paket.seans_sayisi} seans ·{" "}
              {paket.fiyat.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })} (KDV %
              {paket.kdv_orani})
              {paket.satis_bitis_tarihi && (
                <>
                  {" · "}
                  {satisSuresiDoldu(paket.satis_bitis_tarihi) ? (
                    <span className="text-destructive">Satış süresi doldu</span>
                  ) : (
                    <>Satış son tarihi {new Date(paket.satis_bitis_tarihi).toLocaleDateString("tr-TR")}</>
                  )}
                </>
              )}
              {paket.kisi_kotasi != null && <> · Kişi kotası {paket.kisi_kotasi}</>}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {paket.tekrar_sayisi > 1 && <StatusBadge tone="primary">Tekrar: {paket.tekrar_sayisi}</StatusBadge>}
            <StatusBadge tone={paket.aktif ? "emerald" : "slate"}>{paket.aktif ? "Aktif" : "Pasif"}</StatusBadge>
          </div>
        </div>

        {arsivde ? (
          (duzenlenebilir || satisYapabilir) && (
            <div className="flex flex-wrap gap-2">
              <PaketKatilimcilarDialog paket={paket} />
              {duzenlenebilir && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={tekrarPending}
                    className={TEKRARLA_SINIFI}
                    onClick={() => startTekrarTransition(() => paketTekrarla(paket.id))}
                  >
                    {tekrarPending ? "Tekrarlanıyor..." : "Tekrarla"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={DUZENLE_SINIFI}
                    onClick={() => {
                      setDuzenleForm(paket);
                      setAdMetni(isimBasHarfBuyukYap(paket.ad));
                      setDuzenleniyor(true);
                    }}
                  >
                    Düzenle
                  </Button>
                </>
              )}
            </div>
          )
        ) : (
          (duzenlenebilir || satisYapabilir) && (
            <div className="flex flex-wrap gap-2">
              <PaketKatilimcilarDialog paket={paket} />
              {satisYapabilir &&
                (satisEngelliMi(paket) ? (
                  <Button type="button" size="sm" variant="outline" disabled title="Bu paket şu an satılamaz.">
                    Satış
                  </Button>
                ) : (
                  <PaketSatisDialog paket={paket} hastalar={hastalar} className={SATIS_SINIFI} />
                ))}
              {duzenlenebilir && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={aktifPending}
                    className={PASIF_SINIFI}
                    onClick={() =>
                      startAktifTransition(() => paketAktifDurumDegistir(paket.id, !paket.aktif))
                    }
                  >
                    {paket.aktif ? "Pasife al" : "Aktifleştir"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={DUZENLE_SINIFI}
                    onClick={() => {
                      setDuzenleForm(paket);
                      setAdMetni(isimBasHarfBuyukYap(paket.ad));
                      setDuzenleniyor(true);
                    }}
                  >
                    Düzenle
                  </Button>
                </>
              )}
            </div>
          )
        )}
      </Card>
    </li>
  );
}

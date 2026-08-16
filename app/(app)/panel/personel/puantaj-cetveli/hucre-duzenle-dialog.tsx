"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTime } from "@/lib/datetime";
import { dakikaEtiket, gunEtiket, saatKisalt } from "@/lib/puantaj";
import { PUANTAJ_DURUM_SECENEKLERI } from "@/types/puantaj";
import type { PersonelPuantajSatir } from "@/types/puantaj";
import { gunKaydet } from "./actions";
import { FmOnayButonlari } from "./fm-onay-butonlari";

const OTOMATIK_DEGER = "otomatik";
const DURUM_SECENEKLERI_OTOMATIK = [
  { value: OTOMATIK_DEGER, label: "Otomatik (izinden tespit et)" },
  ...PUANTAJ_DURUM_SECENEKLERI,
];

/** Puantaj Cetveli'ndeki bir hücreye tıklanınca açılan, üst bileşenden kontrol edilen gün düzenleme dialogu — tek bir örnek, 150+ ayrı Dialog örneği açmamak için tüm hücreler tarafından paylaşılıyor. */
export function HucreDuzenleDialog({
  acik,
  onOpenChange,
  personelId,
  personelAdi,
  tarih,
  kayit,
  planlanan,
  yonetici,
}: {
  acik: boolean;
  onOpenChange: (acik: boolean) => void;
  personelId: string;
  personelAdi: string;
  tarih: string;
  kayit: PersonelPuantajSatir | null;
  planlanan: { baslangic: string; bitis: string } | null;
  yonetici: boolean;
}) {
  const kaydetAction = gunKaydet.bind(null, personelId, tarih);
  const [durum, formAction, isPending] = useActionState(kaydetAction, null);
  const [gorulenDurum, setGorulenDurum] = useState(durum);

  if (durum !== gorulenDurum) {
    setGorulenDurum(durum);
    if (durum?.success) onOpenChange(false);
  }

  const izinKaynakli = kayit?.kaynak === "izin_talebi";
  const beklemedeFm = kayit != null && (kayit.fazla_mesai_dakika ?? 0) > 0 && kayit.fm_onay_durumu === "bekliyor";

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {personelAdi} — {gunEtiket(tarih)}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Planlanan:{" "}
          {planlanan ? `${saatKisalt(planlanan.baslangic)}–${saatKisalt(planlanan.bitis)}` : "vardiya ataması yok"}
        </p>

        {izinKaynakli && (
          <p className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-700 dark:text-sky-400">
            Bu gün onaylı bir izin talebinden otomatik işlendi — burada düzenlenemez. Değişiklik gerekiyorsa
            ilgili izin talebi üzerinden yapılmalı.
          </p>
        )}

        {!izinKaynakli && beklemedeFm && yonetici && (
          <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
            <span className="text-amber-700 dark:text-amber-400">
              Onay bekleyen fazla mesai: {dakikaEtiket(kayit!.fazla_mesai_dakika)}
            </span>
            <FmOnayButonlari personelId={personelId} puantajId={kayit!.id} />
          </div>
        )}

        {!izinKaynakli && yonetici && (
          <form action={formAction} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="giris_saat">Giriş Saati</Label>
                <Input
                  id="giris_saat"
                  name="giris_saat"
                  type="time"
                  disabled={isPending}
                  defaultValue={kayit?.giris_saat ? formatTime(kayit.giris_saat) : ""}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="cikis_saat">Çıkış Saati</Label>
                <Input
                  id="cikis_saat"
                  name="cikis_saat"
                  type="time"
                  disabled={isPending}
                  defaultValue={kayit?.cikis_saat ? formatTime(kayit.cikis_saat) : ""}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="mola_dakika">Mola (dakika)</Label>
                <Input
                  id="mola_dakika"
                  name="mola_dakika"
                  type="number"
                  min={0}
                  disabled={isPending}
                  defaultValue={kayit?.mola_dakika ?? 0}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="durum">Durum</Label>
                <Select
                  name="durum"
                  disabled={isPending}
                  defaultValue={kayit?.durum ?? OTOMATIK_DEGER}
                  items={DURUM_SECENEKLERI_OTOMATIK}
                >
                  <SelectTrigger id="durum" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURUM_SECENEKLERI_OTOMATIK.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="not_metni">Not</Label>
              <textarea
                id="not_metni"
                name="not_metni"
                rows={2}
                disabled={isPending}
                defaultValue={kayit?.not_metni ?? ""}
                className="w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>

            {durum && !durum.success && (
              <p role="alert" className="text-sm text-destructive">
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending} className="w-fit">
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </form>
        )}

        {!yonetici && !izinKaynakli && (
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Giriş–Çıkış</dt>
              <dd>
                {kayit?.giris_saat ? formatTime(kayit.giris_saat) : "—"} – {kayit?.cikis_saat ? formatTime(kayit.cikis_saat) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Net Çalışma</dt>
              <dd>{dakikaEtiket(kayit?.net_calisma_dakika)}</dd>
            </div>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

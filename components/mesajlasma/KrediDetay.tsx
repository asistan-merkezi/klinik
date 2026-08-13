"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { KrediPaket } from "@/lib/mesajlasma/kredi-fiyat";
import {
  BOLUM_ETIKET,
  KANAL_ETIKET,
  KREDI_ISLEM_ETIKET,
  type MesajKanal,
  type MesajKrediIslemSatir,
  type MesajKullanimOzetSatir,
} from "@/types/mesajlasma";

type SonucDurumu = { success: boolean; message: string } | null;
type KrediYuklemeAction = (onceki: SonucDurumu, formData: FormData) => Promise<SonucDurumu>;

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const tarihFormat = (tarih: string) => new Date(tarih).toLocaleDateString("tr-TR");
const tarihSaatFormat = (tarih: string) => new Date(tarih).toLocaleString("tr-TR");

const GUN_SECENEKLERI = [7, 30, 90] as const;

export function KrediDetay({
  kanal,
  bakiye,
  paketler,
  islemler,
  kullanimOzet,
  gunAraligi,
  action,
}: {
  kanal: MesajKanal;
  bakiye: number;
  paketler: KrediPaket[];
  islemler: MesajKrediIslemSatir[];
  kullanimOzet: MesajKullanimOzetSatir[];
  gunAraligi: number;
  action: KrediYuklemeAction;
}) {
  const idOnEki = useId();
  const [durum, formAction, isPending] = useActionState(action, null);
  const [miktar, setMiktar] = useState("");
  const [tutar, setTutar] = useState("");

  function paketSec(paket: KrediPaket) {
    setMiktar(String(paket.miktar));
    setTutar(String(paket.tutar));
  }

  const kullanimToplam = kullanimOzet.reduce((acc, s) => acc + s.toplam_adet, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Güncel Bakiye — {KANAL_ETIKET[kanal]}</p>
          <p className="text-3xl font-semibold tabular-nums">{bakiye}</p>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Kredi Paketleri</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Fiyatlar örnek/geçicidir, gerçek fiyatlandırma netleşince güncellenecek. Bir pakete tıklayarak
          formu otomatik doldurabilir, ya da elle serbest bir miktar girebilirsiniz.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {paketler.map((p) => (
            <button
              key={p.miktar}
              type="button"
              onClick={() => paketSec(p)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-white/10 dark:bg-card/70",
                miktar === String(p.miktar) && "border-primary/60"
              )}
            >
              <span className="text-lg font-semibold tabular-nums">{p.miktar} kredi</span>
              <span className="text-sm text-muted-foreground">{paraFormat(p.tutar)}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Kredi Yükle</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Ödeme entegrasyonu henüz yok — bu form kredi miktarını doğrudan bakiyeye ekler, gerçek bir
          tahsilat yapmaz.
        </p>
        <form action={formAction} className="flex max-w-sm flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idOnEki}-miktar`}>Kredi Miktarı</Label>
            <Input
              id={`${idOnEki}-miktar`}
              name="miktar"
              type="number"
              min={1}
              step={1}
              required
              disabled={isPending}
              value={miktar}
              onChange={(e) => setMiktar(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idOnEki}-tutar`}>Tutar (₺, opsiyonel)</Label>
            <Input
              id={`${idOnEki}-tutar`}
              name="tutar"
              type="number"
              min={0}
              step="0.01"
              disabled={isPending}
              value={tutar}
              onChange={(e) => setTutar(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${idOnEki}-aciklama`}>Açıklama (opsiyonel)</Label>
            <Input id={`${idOnEki}-aciklama`} name="aciklama" disabled={isPending} placeholder="Örn. banka havalesi ile ödendi" />
          </div>

          {durum && (
            <p role="alert" className={cn("text-sm", durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {durum.message}
            </p>
          )}

          <Button type="submit" disabled={isPending || !miktar} className="w-fit">
            {isPending ? "Yükleniyor..." : "Kredi Yükle"}
          </Button>
        </form>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Kullanım (son {gunAraligi} gün — toplam {kullanimToplam} gönderim)</h2>
          <div className="flex gap-1">
            {GUN_SECENEKLERI.map((gun) => (
              <Button
                key={gun}
                type="button"
                size="sm"
                variant={gun === gunAraligi ? "default" : "outline"}
                nativeButton={false}
                render={<Link href={`/panel/ayarlar/mesajlasma/kredi/${kanal}?gun=${gun}`}>{gun} gün</Link>}
              />
            ))}
          </div>
        </div>

        {kullanimOzet.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu aralıkta gönderim kaydı yok.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Tarih</th>
                  <th className="px-3 py-2 text-left font-medium">Bölüm</th>
                  <th className="px-3 py-2 text-right font-medium">Adet</th>
                </tr>
              </thead>
              <tbody>
                {kullanimOzet.map((s) => (
                  <tr key={`${s.tarih}-${s.bolum}`} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-muted-foreground">{tarihFormat(s.tarih)}</td>
                    <td className="px-3 py-2">{BOLUM_ETIKET[s.bolum]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.toplam_adet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Kredi Hareketleri</h2>
        {islemler.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz kredi hareketi yok.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {islemler.map((islem) => (
              <li key={islem.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex flex-col">
                  <span className="flex items-center gap-2">
                    <StatusBadge tone={islem.islem_tipi === "kullanim" ? "sky" : "emerald"}>
                      {KREDI_ISLEM_ETIKET[islem.islem_tipi]}
                    </StatusBadge>
                    {islem.aciklama && <span className="text-muted-foreground">{islem.aciklama}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{tarihSaatFormat(islem.created_at)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className={cn("tabular-nums font-medium", islem.miktar < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                    {islem.miktar > 0 ? `+${islem.miktar}` : islem.miktar}
                  </span>
                  {islem.tutar != null && <span className="text-xs text-muted-foreground">{paraFormat(islem.tutar)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

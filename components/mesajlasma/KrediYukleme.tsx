"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MerkezKrediPaketi } from "@/lib/mesaj/merkez-client";
import type { MesajKrediHareketi } from "@/types/mesajlasma";

type SonucDurumu = { success: boolean; message: string } | null;
type OdemeAction = (onceki: SonucDurumu, formData: FormData) => Promise<SonucDurumu>;

const tarihSaatFormat = (tarih: string) => new Date(tarih).toLocaleString("tr-TR");

function paraFormat(tutar: number, paraBirimi: string): string {
  try {
    return tutar.toLocaleString("tr-TR", { style: "currency", currency: paraBirimi, minimumFractionDigits: 2 });
  } catch {
    return `${tutar.toLocaleString("tr-TR")} ${paraBirimi}`;
  }
}

export function KrediYukleme({
  paketler,
  paketHatasi,
  hareketler,
  action,
}: {
  /** null: merkeze ulaşılamadı (hata mesajı paketHatasi'nda). */
  paketler: MerkezKrediPaketi[] | null;
  paketHatasi: string | null;
  hareketler: MesajKrediHareketi[];
  action: OdemeAction;
}) {
  const [durum, formAction, isPending] = useActionState(action, null);
  const [secili, setSecili] = useState<string>("");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-sm font-semibold">Kredi Adet ve Fiyat Çizelgesi</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Adet ve fiyatlar Asistan Merkezi&apos;nden anlık çekilir. Paketi seçip &quot;Ödeme Yap&quot;a bastığınızda Asistan Merkezi ödeme sayfasına yönlendirilirsiniz.
        </p>

        {paketler === null ? (
          <p role="alert" className="text-sm text-destructive">
            {paketHatasi ?? "Fiyat çizelgesi alınamadı."}
          </p>
        ) : paketler.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu kanal için satışa açık kredi paketi yok.</p>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="paket_id" value={secili} />
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 text-right font-medium">Kredi Adedi</th>
                    <th className="px-3 py-2 text-right font-medium">Birim Fiyat</th>
                    <th className="px-3 py-2 text-right font-medium">Toplam Fiyat</th>
                  </tr>
                </thead>
                <tbody>
                  {paketler.map((paket) => {
                    const seciliMi = secili === paket.id;
                    return (
                      <tr
                        key={paket.id}
                        onClick={() => !isPending && setSecili(paket.id)}
                        className={cn(
                          "cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/40",
                          seciliMi && "bg-primary/5"
                        )}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="radio"
                            name="paket_secimi"
                            checked={seciliMi}
                            onChange={() => setSecili(paket.id)}
                            disabled={isPending}
                            aria-label={`${paket.adet} kredi`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{paket.adet.toLocaleString("tr-TR")}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {paket.adet > 0 ? paraFormat(paket.fiyat / paket.adet, paket.paraBirimi) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{paraFormat(paket.fiyat, paket.paraBirimi)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {durum && (
              <p role="alert" className={cn("text-sm", durum.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {durum.message}
              </p>
            )}

            <Button type="submit" disabled={isPending || !secili} className="w-fit">
              {isPending ? "Ödeme sayfasına yönlendiriliyor..." : "Ödeme Yap"}
            </Button>
          </form>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Kredi Yükleme Geçmişi</h2>
        {hareketler.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz kredi yüklemesi yok.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hareketler.map((hareket) => (
              <li key={hareket.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex flex-col">
                  {hareket.aciklama && <span className="text-muted-foreground">{hareket.aciklama}</span>}
                  <span className="text-xs text-muted-foreground">{tarihSaatFormat(hareket.created_at)}</span>
                </div>
                <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">+{hareket.miktar}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

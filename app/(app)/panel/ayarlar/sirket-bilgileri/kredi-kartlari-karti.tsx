"use client";

import { useActionState, useState, useTransition } from "react";
import { CirclePlus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KlinikKrediKarti } from "@/types/klinik";
import { krediKartiEkle, krediKartiGuncelle, krediKartiSil } from "./actions";

type KartTipi = KlinikKrediKarti["kart_tipi"];

const KART_TIPI_ETIKET: Record<KartTipi, string> = { klinik: "Şirket Kartı", sahis: "Şahıs Kartı" };

/** Ekleme ve düzenleme aynı formu kullanır; `kart` doluysa düzenleme (gizli id ile). */
function KrediKartiFormu({ kart, kapat }: { kart?: KlinikKrediKarti; kapat: () => void }) {
  const [sonuc, formAction, isPending] = useActionState(kart ? krediKartiGuncelle : krediKartiEkle, null);
  const [gorulenSonuc, setGorulenSonuc] = useState(sonuc);
  const [tip, setTip] = useState<KartTipi>(kart?.kart_tipi ?? "klinik");

  if (sonuc !== gorulenSonuc) {
    setGorulenSonuc(sonuc);
    if (sonuc?.success) kapat();
  }

  const onEk = kart ? `duzenle-${kart.id}-` : "yeni-";

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4">
      <h3 className="text-base font-semibold">{kart ? "Kredi Kartını Düzenle" : "Yeni Kredi Kartı"}</h3>
      {kart && <input type="hidden" name="id" value={kart.id} />}
      <input type="hidden" name="kart_tipi" value={tip} />

      <div className="flex flex-col gap-1.5">
        <Label>Kart Tipi</Label>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(KART_TIPI_ETIKET) as KartTipi[]).map((t) => (
            <button
              key={t}
              type="button"
              disabled={isPending}
              aria-pressed={tip === t}
              onClick={() => setTip(t)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                tip === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {KART_TIPI_ETIKET[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${onEk}kart_adi`}>
            Kart Adı <span className="text-destructive">*</span>
          </Label>
          <Input id={`${onEk}kart_adi`} name="kart_adi" required defaultValue={kart?.kart_adi} placeholder="Örn. Ofis Gider Kartı" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${onEk}banka_adi`}>
            Banka Adı <span className="text-destructive">*</span>
          </Label>
          <Input id={`${onEk}banka_adi`} name="banka_adi" required defaultValue={kart?.banka_adi} placeholder="Türkiye İş Bankası" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${onEk}kart_sahibi`}>Kart Sahibi</Label>
          <Input id={`${onEk}kart_sahibi`} name="kart_sahibi" defaultValue={kart?.kart_sahibi ?? ""} placeholder="Ad Soyad / Şirket unvanı" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${onEk}son_dort_hane`}>Kartın Son 4 Hanesi</Label>
          <Input
            id={`${onEk}son_dort_hane`}
            name="son_dort_hane"
            inputMode="numeric"
            maxLength={4}
            defaultValue={kart?.son_dort_hane ?? ""}
            placeholder="0000"
            disabled={isPending}
            className="font-mono tracking-widest"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Güvenlik için tam kart numarası, son kullanma tarihi ve CVV saklanmaz.</p>

      {sonuc && !sonuc.success && (
        <p role="alert" className="text-sm text-destructive">
          {sonuc.message}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={kapat} disabled={isPending}>
          İptal
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}

function SilmeDugmesi({ id }: { id: string }) {
  const [silinsinMi, setSilinsinMi] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (silinsinMi) {
    return (
      <span className="flex items-center justify-end gap-1.5 text-xs">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await krediKartiSil(id);
              setSilinsinMi(false);
            })
          }
        >
          Sil
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setSilinsinMi(false)}>
          Vazgeç
        </Button>
      </span>
    );
  }
  return (
    <Button type="button" size="icon-sm" variant="ghost" aria-label="Kredi kartını sil" onClick={() => setSilinsinMi(true)}>
      <Trash2 />
    </Button>
  );
}

export function KrediKartlariKarti({
  krediKartlari,
  duzenlenebilir,
}: {
  krediKartlari: KlinikKrediKarti[];
  duzenlenebilir: boolean;
}) {
  const [ekleniyor, setEkleniyor] = useState(false);
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null);
  const duzenlenen = krediKartlari.find((k) => k.id === duzenlenenId);

  return (
    <div className="flex flex-col gap-4">
      {duzenlenebilir && !ekleniyor && !duzenlenen && (
        <Button type="button" className="w-fit" onClick={() => setEkleniyor(true)}>
          <CirclePlus /> Kredi Kartı Ekle
        </Button>
      )}

      {duzenlenebilir && ekleniyor && <KrediKartiFormu kapat={() => setEkleniyor(false)} />}
      {duzenlenebilir && duzenlenen && (
        <KrediKartiFormu key={duzenlenen.id} kart={duzenlenen} kapat={() => setDuzenlenenId(null)} />
      )}

      {krediKartlari.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kayıtlı kredi kartı yok.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Kart Tipi</TableHead>
                <TableHead>Kart Adı</TableHead>
                <TableHead>Banka</TableHead>
                <TableHead>Kart Sahibi</TableHead>
                <TableHead>Kart No</TableHead>
                {duzenlenebilir && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {krediKartlari.map((kart) => (
                <TableRow key={kart.id}>
                  <TableCell>
                    <StatusBadge tone={kart.kart_tipi === "klinik" ? "indigo" : "amber"}>
                      {KART_TIPI_ETIKET[kart.kart_tipi]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="font-medium">{kart.kart_adi}</TableCell>
                  <TableCell className="text-muted-foreground">{kart.banka_adi}</TableCell>
                  <TableCell>{kart.kart_sahibi || "—"}</TableCell>
                  <TableCell className="font-mono text-xs tracking-wide text-muted-foreground">
                    {kart.son_dort_hane ? `•••• ${kart.son_dort_hane}` : "—"}
                  </TableCell>
                  {duzenlenebilir && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Kredi kartını düzenle"
                          onClick={() => {
                            setEkleniyor(false);
                            setDuzenlenenId(kart.id);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <SilmeDugmesi id={kart.id} />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useActionState, useState, useTransition } from "react";
import { CirclePlus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KlinikBankaHesabiDetay } from "@/types/klinik";
import { bankaHesabiEkle, bankaHesabiGuncelle, bankaHesabiSil } from "./actions";

type HesapTipi = KlinikBankaHesabiDetay["hesap_tipi"];

const HESAP_TIPI_ETIKET: Record<HesapTipi, string> = { klinik: "Şirket Hesabı", sahis: "Şahıs Hesabı" };

function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/** Ekleme ve düzenleme aynı formu kullanır; `hesap` doluysa düzenleme (gizli id ile). */
function BankaHesabiFormu({ hesap, kapat }: { hesap?: KlinikBankaHesabiDetay; kapat: () => void }) {
  const [sonuc, formAction, isPending] = useActionState(hesap ? bankaHesabiGuncelle : bankaHesabiEkle, null);
  const [gorulenSonuc, setGorulenSonuc] = useState(sonuc);
  const [tip, setTip] = useState<HesapTipi>(hesap?.hesap_tipi ?? "klinik");

  if (sonuc !== gorulenSonuc) {
    setGorulenSonuc(sonuc);
    if (sonuc?.success) kapat();
  }

  const onEk = hesap ? `duzenle-${hesap.id}-` : "yeni-";

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4">
      <h3 className="text-base font-semibold">{hesap ? "Banka Hesabını Düzenle" : "Yeni Banka Hesabı"}</h3>
      {hesap && <input type="hidden" name="id" value={hesap.id} />}
      <input type="hidden" name="hesap_tipi" value={tip} />

      <div className="flex flex-col gap-1.5">
        <Label>Hesap Tipi</Label>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(HESAP_TIPI_ETIKET) as HesapTipi[]).map((t) => (
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
              {HESAP_TIPI_ETIKET[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${onEk}banka_adi`}>
            Banka Adı <span className="text-destructive">*</span>
          </Label>
          <Input id={`${onEk}banka_adi`} name="banka_adi" required defaultValue={hesap?.banka_adi} placeholder="Türkiye İş Bankası" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${onEk}sube`}>Şube</Label>
          <Input id={`${onEk}sube`} name="sube" defaultValue={hesap?.sube ?? ""} placeholder="Şube adı / kodu" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${onEk}hesap_sahibi`}>Hesap Sahibi</Label>
          <Input id={`${onEk}hesap_sahibi`} name="hesap_sahibi" defaultValue={hesap?.hesap_sahibi ?? ""} placeholder="Ad Soyad / Şirket unvanı" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${onEk}iban`}>IBAN</Label>
          <Input
            id={`${onEk}iban`}
            name="iban"
            defaultValue={hesap?.iban ? formatIban(hesap.iban) : ""}
            placeholder="TR00 0000 0000 0000 0000 0000 00"
            disabled={isPending}
            className="font-mono tracking-wide"
          />
        </div>
      </div>

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
              await bankaHesabiSil(id);
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
    <Button type="button" size="icon-sm" variant="ghost" aria-label="Banka hesabını sil" onClick={() => setSilinsinMi(true)}>
      <Trash2 />
    </Button>
  );
}

export function BankaHesaplariKarti({
  bankaHesaplari,
  duzenlenebilir,
}: {
  bankaHesaplari: KlinikBankaHesabiDetay[];
  duzenlenebilir: boolean;
}) {
  const [ekleniyor, setEkleniyor] = useState(false);
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null);
  const duzenlenen = bankaHesaplari.find((h) => h.id === duzenlenenId);

  return (
    <div className="flex flex-col gap-4">
      {duzenlenebilir && !ekleniyor && !duzenlenen && (
        <Button type="button" className="w-fit" onClick={() => setEkleniyor(true)}>
          <CirclePlus /> Banka Hesabı Ekle
        </Button>
      )}

      {duzenlenebilir && ekleniyor && <BankaHesabiFormu kapat={() => setEkleniyor(false)} />}
      {duzenlenebilir && duzenlenen && (
        <BankaHesabiFormu key={duzenlenen.id} hesap={duzenlenen} kapat={() => setDuzenlenenId(null)} />
      )}

      {bankaHesaplari.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kayıtlı banka hesabı yok.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Hesap Tipi</TableHead>
                <TableHead>Banka</TableHead>
                <TableHead>Şube</TableHead>
                <TableHead>Hesap Sahibi</TableHead>
                <TableHead>IBAN</TableHead>
                {duzenlenebilir && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {bankaHesaplari.map((hesap) => (
                <TableRow key={hesap.id}>
                  <TableCell>
                    <StatusBadge tone={hesap.hesap_tipi === "klinik" ? "indigo" : "amber"}>
                      {HESAP_TIPI_ETIKET[hesap.hesap_tipi]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="font-medium">{hesap.banka_adi}</TableCell>
                  <TableCell className="text-muted-foreground">{hesap.sube || "—"}</TableCell>
                  <TableCell>{hesap.hesap_sahibi || "—"}</TableCell>
                  <TableCell className="font-mono text-xs tracking-wide text-muted-foreground">
                    {hesap.iban ? formatIban(hesap.iban) : "—"}
                  </TableCell>
                  {duzenlenebilir && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Banka hesabını düzenle"
                          onClick={() => {
                            setEkleniyor(false);
                            setDuzenlenenId(hesap.id);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <SilmeDugmesi id={hesap.id} />
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

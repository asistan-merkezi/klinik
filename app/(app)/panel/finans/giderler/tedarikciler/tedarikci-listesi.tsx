"use client";

import { useActionState, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KlinikBankaHesabi } from "@/types/klinik";
import {
  HARCAMA_KATEGORI_ETIKET,
  ODEME_TIPI_ETIKET,
  ODEME_TIPI_SECENEKLERI,
  type HarcamaKategori,
  type OdemeTipi,
} from "@/types/klinik-harcama";
import { giderOdemeBilgisiGuncelle } from "../actions";

export type TedarikciHareketi = {
  id: string;
  tarih: string;
  tutar: number;
  kategori: HarcamaKategori;
  aciklama: string | null;
  odeme_tipi: OdemeTipi | null;
  banka_hesap_id: string | null;
  fatura_no: string | null;
};

export type TedarikciOzeti = {
  anahtar: string;
  ad: string;
  toplam: number;
  sonTarih: string;
  /** Tarihe göre azalan */
  hareketler: TedarikciHareketi[];
};

const paraFormat = (tutar: number) => tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
const tarihFormat = (tarih: string) => new Date(tarih).toLocaleDateString("tr-TR");

export function TedarikciListesi({
  tedarikciler,
  bankaHesaplari,
  duzenlenebilir,
}: {
  tedarikciler: TedarikciOzeti[];
  bankaHesaplari: KlinikBankaHesabi[];
  duzenlenebilir: boolean;
}) {
  const [arama, setArama] = useState("");
  const [acikAnahtar, setAcikAnahtar] = useState<string | null>(null);

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return q ? tedarikciler.filter((t) => t.ad.toLocaleLowerCase("tr-TR").includes(q)) : tedarikciler;
  }, [tedarikciler, arama]);

  const genelToplam = tedarikciler.reduce((acc, t) => acc + t.toplam, 0);
  const bekleyenSayisi = tedarikciler.reduce((acc, t) => acc + t.hareketler.filter((h) => !h.odeme_tipi).length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Tedarikçi Sayısı</p>
            <p className="tabular text-2xl font-semibold">{tedarikciler.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Toplam Ödenen</p>
            <p className="tabular text-2xl font-semibold text-primary">{paraFormat(genelToplam)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Ödeme Bilgisi Bekleyen</p>
            <p className={cn("tabular text-2xl font-semibold", bekleyenSayisi > 0 && "text-amber-600 dark:text-amber-400")}>
              {bekleyenSayisi} kayıt
            </p>
          </CardContent>
        </Card>
      </div>

      {bekleyenSayisi > 0 && (
        <p className="text-sm text-muted-foreground">
          Ödeme yöntemi seçilmemiş kayıtlar Kasa/Banka/Kredi Kartı mutabakatına düşmez. Tedarikçiyi açıp ilgili kayıtta
          ödeme bilgisini girin.
        </p>
      )}

      <Input
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        placeholder="Tedarikçi ara"
        aria-label="Tedarikçi ara"
        className="max-w-sm"
      />

      {filtreli.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={tedarikciler.length === 0 ? "Henüz tedarikçi kaydı yok." : "Aramayla eşleşen tedarikçi yok."}
          description={
            tedarikciler.length === 0
              ? "Giderlere tedarikçi adı girildikçe burada tedarikçi bazında listelenir."
              : undefined
          }
          compact
        />
      ) : (
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Tedarikçi</TableHead>
              <TableHead className="text-right">İşlem</TableHead>
              <TableHead>Son İşlem</TableHead>
              <TableHead className="text-right">Toplam Ödenen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtreli.map((t) => {
              const acik = acikAnahtar === t.anahtar;
              return (
                <TedarikciSatiri
                  key={t.anahtar}
                  t={t}
                  acik={acik}
                  degistir={() => setAcikAnahtar(acik ? null : t.anahtar)}
                  bankaHesaplari={bankaHesaplari}
                  duzenlenebilir={duzenlenebilir}
                />
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TedarikciSatiri({
  t,
  acik,
  degistir,
  bankaHesaplari,
  duzenlenebilir,
}: {
  t: TedarikciOzeti;
  acik: boolean;
  degistir: () => void;
  bankaHesaplari: KlinikBankaHesabi[];
  duzenlenebilir: boolean;
}) {
  const bekleyen = t.hareketler.filter((h) => !h.odeme_tipi).length;
  return (
    <>
      <TableRow className="cursor-pointer" onClick={degistir} aria-expanded={acik}>
        <TableCell className="font-medium">
          <span className="flex flex-wrap items-center gap-1.5">
            {acik ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
            {t.ad}
            {bekleyen > 0 && <StatusBadge tone="amber">{bekleyen} ödeme bilgisi bekliyor</StatusBadge>}
          </span>
        </TableCell>
        <TableCell className="tabular text-right text-muted-foreground">{t.hareketler.length}</TableCell>
        <TableCell className="text-muted-foreground">{tarihFormat(t.sonTarih)}</TableCell>
        <TableCell className="tabular text-right font-medium">{paraFormat(t.toplam)}</TableCell>
      </TableRow>
      {acik && (
        <TableRow className="hover:bg-transparent">
          <td colSpan={4} className="bg-muted/30 px-4 py-3">
            <ul className="flex flex-col divide-y divide-border">
              {t.hareketler.map((h) => (
                <HareketSatiri key={h.id} h={h} bankaHesaplari={bankaHesaplari} duzenlenebilir={duzenlenebilir} />
              ))}
            </ul>
          </td>
        </TableRow>
      )}
    </>
  );
}

function HareketSatiri({
  h,
  bankaHesaplari,
  duzenlenebilir,
}: {
  h: TedarikciHareketi;
  bankaHesaplari: KlinikBankaHesabi[];
  duzenlenebilir: boolean;
}) {
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const banka = bankaHesaplari.find((b) => b.id === h.banka_hesap_id);
  const odemeMetni = h.odeme_tipi
    ? h.odeme_tipi === "havale" && banka
      ? `Havale (${banka.banka_adi})`
      : ODEME_TIPI_ETIKET[h.odeme_tipi]
    : null;

  return (
    <li className="flex flex-col gap-2 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-24 shrink-0 text-muted-foreground">{tarihFormat(h.tarih)}</span>
        <StatusBadge tone="slate">{HARCAMA_KATEGORI_ETIKET[h.kategori]}</StatusBadge>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {[h.aciklama, h.fatura_no ? `Fatura ${h.fatura_no}` : null].filter(Boolean).join(" · ") || "—"}
        </span>
        {odemeMetni ? (
          <span className="text-muted-foreground">{odemeMetni}</span>
        ) : (
          <StatusBadge tone="amber">Ödeme bilgisi bekliyor</StatusBadge>
        )}
        <span className="tabular w-28 text-right">{paraFormat(h.tutar)}</span>
        {duzenlenebilir && !duzenleniyor && (
          <Button
            type="button"
            size={odemeMetni ? "icon-sm" : "sm"}
            variant={odemeMetni ? "ghost" : "outline"}
            aria-label="Ödeme bilgisini düzenle"
            onClick={() => setDuzenleniyor(true)}
          >
            {odemeMetni ? <Pencil /> : "Ödeme Bilgisi Gir"}
          </Button>
        )}
      </div>
      {duzenleniyor && (
        <OdemeBilgisiFormu h={h} bankaHesaplari={bankaHesaplari} kapat={() => setDuzenleniyor(false)} />
      )}
    </li>
  );
}

function OdemeBilgisiFormu({
  h,
  bankaHesaplari,
  kapat,
}: {
  h: TedarikciHareketi;
  bankaHesaplari: KlinikBankaHesabi[];
  kapat: () => void;
}) {
  const [sonuc, formAction, isPending] = useActionState(giderOdemeBilgisiGuncelle, null);
  const [gorulenSonuc, setGorulenSonuc] = useState(sonuc);
  const [tip, setTip] = useState<OdemeTipi | "">(h.odeme_tipi ?? "");

  if (sonuc !== gorulenSonuc) {
    setGorulenSonuc(sonuc);
    if (sonuc?.success) kapat();
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <input type="hidden" name="id" value={h.id} />
      <input type="hidden" name="odeme_tipi" value={tip} />

      <div className="flex flex-col gap-1.5">
        <Label>Ödeme Yöntemi</Label>
        <div className="grid grid-cols-3 gap-2">
          {ODEME_TIPI_SECENEKLERI.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={isPending}
              aria-pressed={tip === s.value}
              onClick={() => setTip(s.value)}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                tip === s.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {tip === "havale" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`banka-${h.id}`}>Banka Hesabı</Label>
          <select
            id={`banka-${h.id}`}
            name="banka_hesap_id"
            defaultValue={h.banka_hesap_id ?? ""}
            required
            disabled={isPending}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              Hesap seçin
            </option>
            {bankaHesaplari.map((b) => (
              <option key={b.id} value={b.id}>
                {b.banka_adi}
                {b.sube ? ` — ${b.sube}` : ""}
              </option>
            ))}
          </select>
          {bankaHesaplari.length === 0 && (
            <p className="text-xs text-muted-foreground">Önce Şirket Bilgileri&apos;nden banka hesabı ekleyin.</p>
          )}
        </div>
      )}

      {sonuc && !sonuc.success && (
        <p role="alert" className="text-sm text-destructive">
          {sonuc.message}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={kapat} disabled={isPending}>
          İptal
        </Button>
        <Button type="submit" size="sm" disabled={isPending || !tip}>
          {isPending ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}

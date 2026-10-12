"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  HARCAMA_KATEGORI_ETIKET,
  ODEME_TIPI_ETIKET,
  type HarcamaKategori,
  type OdemeTipi,
} from "@/types/klinik-harcama";

export type TedarikciHareketi = {
  id: string;
  tarih: string;
  tutar: number;
  kategori: HarcamaKategori;
  aciklama: string | null;
  odeme_tipi: OdemeTipi | null;
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

export function TedarikciListesi({ tedarikciler }: { tedarikciler: TedarikciOzeti[] }) {
  const [arama, setArama] = useState("");
  const [acikAnahtar, setAcikAnahtar] = useState<string | null>(null);

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return q ? tedarikciler.filter((t) => t.ad.toLocaleLowerCase("tr-TR").includes(q)) : tedarikciler;
  }, [tedarikciler, arama]);

  const genelToplam = tedarikciler.reduce((acc, t) => acc + t.toplam, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>

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
                <TedarikciSatiri key={t.anahtar} t={t} acik={acik} degistir={() => setAcikAnahtar(acik ? null : t.anahtar)} />
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TedarikciSatiri({ t, acik, degistir }: { t: TedarikciOzeti; acik: boolean; degistir: () => void }) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={degistir} aria-expanded={acik}>
        <TableCell className="font-medium">
          <span className="flex items-center gap-1.5">
            {acik ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
            {t.ad}
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
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="w-24 shrink-0 text-muted-foreground">{tarihFormat(h.tarih)}</span>
                  <StatusBadge tone="slate">{HARCAMA_KATEGORI_ETIKET[h.kategori]}</StatusBadge>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {[h.aciklama, h.fatura_no ? `Fatura ${h.fatura_no}` : null].filter(Boolean).join(" · ") || "—"}
                  </span>
                  <span className="text-muted-foreground">{h.odeme_tipi ? ODEME_TIPI_ETIKET[h.odeme_tipi] : "—"}</span>
                  <span className="tabular w-28 text-right">{paraFormat(h.tutar)}</span>
                </li>
              ))}
            </ul>
          </td>
        </TableRow>
      )}
    </>
  );
}
